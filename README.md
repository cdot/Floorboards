# Floorboards

T&G style floor boarding, where boards are designed to lock to into neighbouring boards end to end and side to side, can be difficult to plan. A poor design will lead to staircase effects and a lot of wasted boarding. This little browser application is designed to help you do that.

A room is defined by a hard-coded set of vertices representing
the polygon of the floor area, oriented so the boards will run top
to bottom. Note there is no automatic allowance for expansion. Tries
to minimise the number of horizontal cuts, but vertical cuts (along
the length of the board) are your problem.

Note that walls must be horizontal and/or vertical.
Diagonal walls are not currently supported.

The package also includes a minimal web server that you can use to serve local files, if you don't have a web host handy.

