============================================================
  D2R COMMAND CENTER  -  START HERE
  A friendly point-and-click UI for Shupershuff's D2R Loader
  (v2.7)
============================================================

This little app gives Shupershuff's Diablo 2 Resurrected loader a
nice button-based screen, so you don't have to type commands. It uses
HIS loader exactly as-is - it never changes his files.


------------------------------------------------------------
  WHAT'S NEW IN 2.7  (quick list)
------------------------------------------------------------

  * "Launch & Presets" order reversed: Batch Launch is on top again,
    then Presets, then Batch Load Order.

  * NEW privacy button on the Accounts page: "Show emails / Hide
    emails". Emails are hidden by default and shown as j*******@g****.com
    so you cannot accidentally show a real address on stream. Reveal all
    with one click, or reveal a single row with the little eye.

------------------------------------------------------------
  WHAT WAS NEW IN 2.6
------------------------------------------------------------

  * The Terror Zone and DClone live status now sit right under the
    "Command Log" button in the left sidebar. They used to be pushed
    to the very bottom. Their drop-downs now open downward.

  * The "Rp_Casanova - YOYO Crescendo" credit is now a full-width
    pill that spans the sidebar, with a bigger font that scales to
    fit. Its socials/tip menu matches the pill width.

  * On "Launch & Presets", Presets now comes first, then Batch
    Launch, then Batch Load Order.

  * In Configuration, the Playtime Tracking and Terror Zones cards
    no longer leave big uneven gaps. All the cards now pack tightly
    into two balanced columns, so placement is uniform.

  Still here from 2.5: one-click desktop icon, shortcut replaced on
  update, Batch Load Order, and the full GitHub write-up.
  Still here from 2.4: drag & drop manual launch order, remembered
  window size and position, and the tidier Accounts table.


------------------------------------------------------------
  THE 60-SECOND SETUP
------------------------------------------------------------

1)  Unzip this whole folder somewhere you'll keep it, like your
    Desktop.  (Keep all the files together.)

2)  Double-click:

        Install-D2R-Command-Center.bat

    That's it. It sets EVERYTHING up for you:
      - installs the small helper it needs (it will grab Node.js
        for you if you don't already have it),
      - finds your D2Loader.ps1 automatically,
      - puts a "D2R Command Center" icon on your Desktop,
      - and opens the app.

    If Windows shows a blue "Do you want to allow this?" box, click
    Yes.  (That's just because the loader needs admin rights to
    launch the game - same as always.)

3)  From now on, just double-click the "D2R Command Center" icon on
    your Desktop to open it.  (Or Start-D2R-Command-Center.bat.)


------------------------------------------------------------
  USING IT
------------------------------------------------------------

  - INSTANCES  = your accounts. Each card has a region picker
                 (NA / EU / KR) and a big LAUNCH button.

  - Pick a region, click LAUNCH, and the game starts.

  - "Open All Accounts" launches every account at once.

  - LAUNCH & PRESETS = batch launching. The 2 / 4 / 6 / 8 buttons spin
                       up that many accounts, the batch box launches a
                       batch ID, and "Or pick accounts manually" lets
                       you drag cards into a one-off load order.

  - BATCH LOAD ORDER (on Launch & Presets) = change the order an
                       ALREADY-CREATED batch loads in. Pick the batch,
                       drag the accounts, click "Save order". Position
                       1 loads first. A backup called Accounts.csv.bak
                       is made the first time you save, so you can
                       undo it by copying it back over Accounts.csv.

  - CONFIGURATION = all of Shupershuff's config.xml options, as
                    buttons and toggles. No XML editing.

  - ACCOUNTS = edit your account list. The KEY button gets a
               Battle.net token for an account automatically.

  - COMMAND LOG = shows exactly what got launched, so you can see
                  what happened if something didn't start.


------------------------------------------------------------
  A FEW THINGS TO KNOW
------------------------------------------------------------

  * Nothing leaves your computer. Your passwords and tokens stay
    on your machine (and stay encrypted, the same way the loader
    encrypts them).

  * The app opens in its OWN small, lightweight browser window (a
    separate minimal profile). It does not touch or slow down your
    everyday Edge/Chrome, and it uses far less memory.

  * The first launch may ask for admin permission - that's normal,
    the loader needs it.

  * The loader no longer pops up its own black window every time you
    launch an account. It runs quietly behind the scenes, so clicking
    LAUNCH just starts the game. (Want to see it again? Turn off
    "Run loader in background" in CONFIGURATION.)

  * If the app ever doesn't start, open the file "bridge.log" in
    this folder - it explains what went wrong. You can also just
    double-click "scripts\Run-Bridge.bat" as a simple backup
    launcher.


------------------------------------------------------------
  LAUNCHING SEVERAL ACCOUNTS  (ONE AT A TIME)
------------------------------------------------------------

  Battle.net only lets ONE token login happen per internet
  connection at a time - if two start together, they fail.

  So the Command Center launches accounts ONE AT A TIME, exactly
  like the loader's own "b" (batch) option:

  * Click as many LAUNCH buttons as you like (or Launch Batch,
    Launch Selected, the 2/4/6/8 buttons, or a preset).
  * The first one starts. The rest show "Queued".
  * When that account reaches the CHARACTER SELECT screen, the
    next one starts automatically.
  * A bar at the top shows what's launching. "Cancel waiting"
    stops the ones that haven't started yet.

  Tip: get each account to character select promptly - the next
  one waits for it.


------------------------------------------------------------
  KNOWS WHEN YOU CLOSE A GAME
------------------------------------------------------------

  The cards update themselves. If you close a game with the X
  button, Task Manager, or it crashes, its card goes back to
  "Available" within a few seconds - no need to refresh.

  There's also a REFRESH button at the top of the Instances
  screen. It re-checks which games are open and reloads your
  Accounts.csv (handy if you edited it outside the app).

  (The little green "LIVE" tag next to it means auto-detection
  is working.)


------------------------------------------------------------
  LIVE STATUS  &  TERROR ZONES   (new in v2.3)
------------------------------------------------------------

  The app can show the SAME live info Shupershuff's loader shows -
  the current Terror Zone and the Diablo Clone ("DClone") walk
  progress - pulled straight from D2Emu.com.

  WHERE TO SEE IT
    * LAUNCH & PRESETS screen -> the "🌍 Live Status" panel at the
      bottom. It shows:
         - TERROR ZONE LIVE NOW  : the zones that are terrorized
           right now (with boss packs + immunities),
         - NEXT                  : the zones coming up + the time
           they rotate in,
         - 🐉 DCLONE STATUS      : the walk progress (x/6) for every
           game mode in your region.
    * CONFIGURATION screen -> the "🔥 Terror Zones" card. It shows
      the same live "Now / Next" data right next to the Alert Areas
      box, plus a button that fills Alert Areas in for you:
         "Use current TZ as Alert Areas".

  PICKING YOUR REGION
    The Live Status panel has US / EU / KR / CN buttons. It starts
    on US (Americas) and remembers whatever you pick.

  It refreshes itself about once a minute. Hit the ⟳ button in the
  panel to refresh it instantly. (This is read-only - it never
  changes your loader or your accounts.)


------------------------------------------------------------
  RUNNING IN THE BACKGROUND  (ONE WINDOW ONLY)
------------------------------------------------------------

  The Command Center is built to stay out of your way:

  * ONE window only. No matter how many times you click the icon,
    you will never get two Command Center windows. The second click
    just brings the one you already have to the front.

  * No leftover windows. The little helper that runs in the
    background (the "bridge") starts with NO console window, so
    there's nothing sitting in your taskbar.

  * Want it to run with no window at all?  Double-click:

        Start-Background.bat

    That starts the background helper only - no browser, no window.
    Open the app any time with the "D2R Command Center" desktop icon
    (it reuses the same background helper).

  * To stop it completely, double-click:

        Stop-D2R-Command-Center.bat


------------------------------------------------------------
  UPDATING TO A NEW VERSION  (already installed?)
------------------------------------------------------------

  If you ALREADY have D2R Command Center set up and you just
  downloaded a newer version, do this:

     1. Unzip the new version into a NEW, empty folder.
        (Do NOT unzip it on top of your old folder - that is
        what used to create a confusing nested sub-folder.)

     2. In that new folder, double-click:

            Update-D2R-Command-Center.bat

     That one file does everything:
        - finds your existing D2R Command Center folder,
        - stops the running app,
        - REMOVES the old files,
        - copies the new files in,
        - keeps your settings (loader path) and accounts,
        - restarts the app.

     It never touches Shupershuff's D2Loader.ps1.

  To confirm the update worked, look at the bottom of the app's
  left sidebar - it should read "UI v2.7" and "Bridge v2.7".
  (You can also open VERSION.txt in this folder.)

  If the browser still shows the old look, press Ctrl+F5 once.

  Want a clean install instead? Extract this zip into a brand-new
  empty folder and run Install-D2R-Command-Center.bat there.


------------------------------------------------------------
  NEED TO POINT IT AT YOUR LOADER MANUALLY?
------------------------------------------------------------

  The installer finds D2Loader.ps1 on its own in the usual spots
  (Desktop, Downloads, Documents, C:\). If it can't find yours:

     1. Open the app  ->  CONFIGURATION
     2. Under "Loader & Bridge", click BROWSE next to
        "D2Loader.ps1 path" and pick your D2Loader.ps1.
     3. Click "Save paths". The status turns green when it's found.


------------------------------------------------------------
  WHAT'S IN THIS FOLDER  (new in v2.3)
------------------------------------------------------------

  The main folder is kept tidy. You only ever need the five .bat
  files - everything else lives in sub-folders:

      Install-D2R-Command-Center.bat   <- run this first
      Update-D2R-Command-Center.bat    <- to update to a new version
      Create-Desktop-Shortcut.bat      <- (re)make the desktop icon
      Start-D2R-Command-Center.bat     <- open the app
      Stop-D2R-Command-Center.bat      <- close it completely

      app\      the actual program files
      scripts\  helper scripts the .bat files use (leave alone)
      docs\     the technical README.md
      assets\   the app icons
      data\     reference data + sample files
      README.txt / VERSION.txt / bridge.log

  You can safely ignore app\, scripts\, docs\ and data\ - just use
  the .bat files above.


------------------------------------------------------------
  CREDIT
------------------------------------------------------------

  The loader itself is made by Shupershuff:
      https://github.com/shupershuff/Diablo2RLoader

  If it saves you time, buy him a beer:
      https://www.buymeacoffee.com/shupershuff

  This UI is just a nicer face on his hard work.
  (Detailed/technical notes live in README.md.)


------------------------------------------------------------
  MADE WITH LOVE BY RP_CASANOVA "YOYO CRESCENDO"
------------------------------------------------------------

  In the top-left of the app it says "made with love by
  Rp_Casanova".  Click the name to open a little menu with:

      Twitch  ....  https://www.twitch.tv/rp_casanova
      YouTube ...  https://www.youtube.com/@YOYOCrescendo
      Tip .....  https://streamlabs.com/rp_casanova1/tip

  Thanks for using it - come say hi on stream!
============================================================
