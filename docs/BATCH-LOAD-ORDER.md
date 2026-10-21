# ↕ Batch load order

> **Goal:** change the order an *existing* batch loads in, from the UI, without
> modifying `D2Loader.ps1`.

This document explains why that is possible, how the bridge does it safely, and
what the limits are.

---

## 1. Why row order is load order

Shupershuff's loader builds a batch by iterating the parsed `Accounts.csv` array
in file order and appending every row that belongs to the requested batch:

```powershell
# D2Loader.ps1 — batch collection (abridged)
ForEach ($ID in $Script:AccountOptionsCSV){
    if ($ID.id -in $Script:AcceptableBatchIDs -and
        $ID.batches.split(',') -contains $Script:BatchToOpen.tostring()){
        $Script:BatchedAccountIDsToOpen += $ID.id
    }
}
```

`$Script:BatchedAccountIDsToOpen` is then launched sequentially, each one waiting
for token authentication before the next begins. Because the collection loop
follows the CSV, **the order of matching rows in `Accounts.csv` is the order the
accounts launch.**

So "change the load order of batch 2" is equivalent to "reorder the batch-2 rows
in `Accounts.csv`". That's a data edit to a file we already own the writer for —
no code change on his side.

### The `Batches` column

`Batches` holds one or more batch IDs, comma-separated:

```csv
ID,Acct,AccountLabel,Batches,...
1,a@x.com,FriendlyDisplayname,,
2,b@x.com,BigJoeBloggs,1,
3,c@x.com,JosephineBloggs,"1,2",
4,d@x.com,JohnDoe,"1,2",
```

Here batch 1 = rows 2,3,4 (in that order) and batch 2 = rows 3,4. Note the
overlap: accounts 3 and 4 are in both batches. That overlap is the tricky part.

---

## 2. The reorder algorithm

Given `batch = B` and a requested order `ids = [i0, i1, … iN-1]`:

1. **Read** the CSV into `rows[]` and locate the header indexes for `ID` and
   `Batches`.
2. **Find the slots:** `slots = [rowIndex for each row where Batches includes B]`,
   in file order. These are the only positions we are allowed to touch.
3. **Validate the set:** the multiset of `ids` must equal the multiset of IDs
   currently in those slots. If not, abort with a message naming the expected
   count. This makes it impossible to accidentally drop or duplicate an account
   through the UI.
4. **Rewrite the slots:** for `k` in `0…slots.length-1`,
   `next[slots[k]] = byId.get(ids[k])`.
5. **Everything else is untouched.** Rows not in batch `B` keep their exact
   index. So an account that is also in batch 2 keeps its position relative to
   other batch-2 rows — the overlap stays stable.
6. **Back up once:** if `Accounts.csv.bak` doesn't exist yet, copy the original
   there before writing.
7. **Write** with the same header, same column order, same quoting rules
   (`serializeCsv()`), then respond `{ok:true, batch, order:[…]}`.

### Worked example

```
before:  ID  Batches
         1   (none)
         2   1
         3   1,2
         4   1,2

request: batch=1, ids=[4,2,3]

slots for batch 1 = [1,2,3]   (rows holding IDs 2,3,4)
next[1]=row(4), next[2]=row(2), next[3]=row(3)

after:   ID  Batches
         1   (none)
         4   1,2
         2   1
         3   1,2
```

Batch 1 now loads `4 → 2 → 3`. Batch 2 still loads `4 → 3` — the same relative
order it had before, because we only permuted positions that both batches
happened to share, and 4 was already ahead of 3 in batch 2.

> If you *do* want to change batch 2 as well, edit batch 2 separately. Each
> batch's ordering is its own operation, and each is validated independently.

---

## 3. API

### `GET /api/batch-order`

No query: list batches.

```json
{
  "ok": true,
  "path": "C:\\...\\Accounts.csv",
  "batches": [
    { "id": "1", "count": 3, "ids": ["2","3","4"] },
    { "id": "2", "count": 2, "ids": ["3","4"] }
  ]
}
```

With `?batch=1`: return that batch's rows in current file order.

```json
{
  "ok": true,
  "path": "C:\\...\\Accounts.csv",
  "batch": "1",
  "rows": [
    { "id": "2", "label": "BigJoeBloggs", "acct": "b@x.com", "batches": "1" },
    { "id": "3", "label": "JosephineBloggs", "acct": "c@x.com", "batches": "1,2" },
    { "id": "4", "label": "JohnDoe", "acct": "d@x.com", "batches": "1,2" }
  ]
}
```

### `POST /api/batch-order`

```json
{ "batch": "1", "ids": ["4","2","3"] }
```

Responses:

| Status | Body | When |
|---|---|---|
| 200 | `{ok:true, batch:"1", order:["4","2","3"]}` | written |
| 400 | `{ok:false, error:"The order must contain exactly the accounts in batch 1 (got 2, expected 3)."}` | set mismatch |
| 400 | `{ok:false, error:"Batch 1 has no accounts in Accounts.csv."}` | empty/unknown batch |
| 500 | `{ok:false, error:"…"}` | file I/O failure |

The bridge never launches anything as part of this call, and it never touches
`config.xml`.

---

## 4. UI

**Launch & Presets → ↕ Batch Load Order**

- **Which batch?** dropdown, populated from the CSV (`Batch 1 — 3 accounts`).
- A drag list. Grab the ⠿ handle, drop above/below the midpoint of a row. The
  index badge on the left is the launch position (1 loads first).
- **Save order** posts the new sequence; **Reset** reloads from disk and discards
  unsaved changes.
- Status line: `3 accounts in batch 1` → `Unsaved changes` → `Saved — batch 1
  will load in this order.`
- The dropdown refreshes itself when the bridge comes online, and the panel
  refuses to overwrite unsaved edits on a background refresh.

---

## 5. Limits and gotchas

- **The loader must not be mid-launch** while you save. The write is fast and
  atomic, but a batch already in progress has its order fixed in memory.
- **Only rows in the selected batch move.** If you want to move an account that
  is not in the batch, add it to the batch first (Accounts tab), then order it.
- **IDs are the identity, not labels.** Renaming a label doesn't affect order.
- **Duplicated IDs** are rejected by the set validation, which is deliberate —
  duplicate IDs break his loader too.
- **The `.bak` is one-time**, not per-save. It preserves your *original* order so
  you can always get back to a known-good state. Delete it after you're happy and
  the next save creates a fresh one.
- **Excel** may rewrite quoting if you edit the CSV by hand afterwards. Prefer
  the Accounts tab, or a plain-text editor.
