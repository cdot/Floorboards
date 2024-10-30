# Floorboards

Tongue-and-groove style floor boarding, where boards are designed to
lock to into neighbouring boards end to end and side to side, can be
awkward to plan. Poor planning can lead to ugly staircase effects and
can cause a lot excess cuts, and even wasted boarding. This little
browser application is designed to help you plan your layout, for
rectilinear rooms (those with straight walls, no diagonals).

A room is defined in JSON by a hard-coded set of vertices representing
the polygon of the floor area, oriented so the boards will run top to
bottom. Note there is no automatic allowance for expansion, it's up to
you to size the room taking that into account. The app will try to
minimise the number of horizontal cuts, but vertical cuts (along the
length of the board) are your problem

Here's an example room:
```
{
  "vertices": [
    { "x": 0, "y": 0, "id": "top left corner" },
    { "x": 100, "y": 0, "id": "top right corner" },
    { "x": 100, "y": 100, "id": "bottom right corner" },
    { "x": 0, "y": 100, "id": "bottom left corner" }
  ]
}
```
Once you have worked out a suitable layout, you can save the result and
reload it later.

The package also includes a minimal web server that you can use to
serve local files, if you don't have a web host handy.

