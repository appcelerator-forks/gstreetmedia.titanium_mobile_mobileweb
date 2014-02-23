This is just a collection of all the things I'm fixing in TI Mobile - MobileWeb.

I'm storing all off these fixes in one place and will try to fork and branch TI when my current project is finished.

So Far:

1. KineticScrollView.js =>
	Position not properly updated after scroll (same problem as item #2). This means you cannot get the correct contentOffet on scrollend
	Position information not updated while dragging, thus you can never can correct contentOffset.x & y
2. ScrollView.js => Fires "scrollEnd" instead of "scrollend"
3. Animation.js => View.rect, not updated after animation [TIMOB-8930]
4. TableViewRow.js => creates dom elements for imageLeft, title, imageRight even if you aren't using them
5. TableViewRow.js => doesn't correctly using left property to space elements
6. TableViewSection.js => creates separators in dom rather than just using borderBottom
7. _build.js => doesn't correctly parse font folder. Doesn't add font correctly. Doesn't prefetch fonts, so they mismeasure (FontWidget)
8. ImageView.js 'load' event doesn't fire due to incorrect context on "this". 
9. ActivityIndicator.js Wheel does not animate properly on FireFox
10. Button.js had no font property, thus all buttons had the default font.
