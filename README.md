# Floorboards

Calculate boarding needed for a room. Not user friendly!

Run the server:

node server.js

Visit in a browser.

The room is defined by a hard-coded set of vertices representing
the polygon of the floor area, oriented so the boards will run top
to bottom. Note there is no automatic allowance for expansion. Tries
to minimise the number of horizontal cuts, but vertical cuts (along the length of the board) are your problem.
