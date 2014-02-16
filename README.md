This is just a collection of all the things I'm fixing in TI Mobile - MobileWeb.

There are frankly, just too many bugs, that I can't open a pull request for each one. So, I'm storing all off these fixes in one place and will try to fork and branch TI when my current project is finished.

So Far:

1. Fixes KineticScrollView. Position not properly updated after scroll (same problem as item #2)
2. View.rect, not updated after animation
3. TableViewRow creates dom elements for imageLeft, title, imageRight even if you aren't using them
4. TableViewSection creates separators in dom rather than just using borderBottom
5. _build.js doesn't correctly parse font folder. Doesn't add font correctly. Doesn't prefetch fonts, so they mismeasure (FontWidget)
6. 
