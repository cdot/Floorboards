/* Copyright 2024 Crawford Currie */

// Parameters governing the layout, all settable from the UI
const params = {
  PLANK_WIDTH: 12.5,
  PLANK_LENGTH: 91.5,
  CUT_THICKNESS: 0.3,
  MIN_PLANK_LENGTH: 25,
  START_LEFT: -2
};

/**
 * Class of horizontal edges. We're only interested in this subset of
 * the room polygon, because these are the edges that limit board length.
 */
class HEdge {

  constructor(left, right, y) {
    // Left end of this edge
    this.left = left;
    // Right end of this edge
    this.right = right;
    // Y for this edge
    this.y = y;
  }

  toString() {
    return `${this.left}-${this.right},${this.y}`;
  }
}

/**
 * The room is divided left-to-right into columns, each the width of
 * a plank. Then the planks are laid into each column.
 */
class Column {

  constructor(left) {
    this.left = left;
    this.right = left + params.PLANK_WIDTH;
    // Top and bottom will be worked out by limit()
    this.top = Number.MAX_SAFE_INTEGER;
    this.bottom = Number.MIN_SAFE_INTEGER;
    // Planks in this column
    this.planks = [];
  }

  /**
   * Check if a horizontal edge imposes a limit on the top/bottom
   * of our column.
   * @param {HEdge} hedge the edge
   */
  limit(hedge) {
    if ((hedge.left <= this.left && hedge.right > this.left)
        // intersects left side
        || (hedge.left < this.right && hedge.right >= this.right)
        // intersects right side
        || (hedge.left < this.left && hedge.right > this.right)
        // intersects both sides
        || (hedge.left > this.left && hedge.right < this.right)
        // contained
       ) {
      this.bottom = Math.max(hedge.y, this.bottom);
      this.top = Math.min(hedge.y, this.top);
    }
  }

  get height() {
    return this.bottom - this.top;
  }

  /**
   * @param {Surface} surf
   */
  draw(surf) {
    for (const plank of this.planks)
      plank.draw(surf);
  }

  /**
   * Make the left of all planks the same as the left of the column.
   * This is used when moving columns around
   */
  lineUpPlanks() {
    for (const plank of this.planks)
      plank.left = this.left;
  }

  toString() {
    return `Col T${this.top},L${this.left},B${this.bottom},R${this.right}`;
  }
}

/**
 * Planks are laid into columns
 */
class Plank {

  static NEXT = 1;

  /**
   * @param {number} left left of the plank
   * @param {number} top top of the plank
   * @param {string} id identifier for the plank
   */
  constructor(left = 0, top = 0, id) {
    // Identified for this plank
    this.id = id ?? Plank.NEXT++;
    // Which side of a cut this plank is (blank if it's a whole plank)
    this.AB = "";
    // Where the plank is
    this.left = left;
    this.top = top;
    // How big it is (width will never change, length will change
    // when the plank is cut)
    this.width = params.PLANK_WIDTH;
    this.length = params.PLANK_LENGTH;
  }

  get bottom() { return this.top + this.length; }

  get middle() { return this.top + this.length / 2; }

  get right() { return this.left + this.width; }

  get centre() { return this.left + this.width / 2; }

  /**
   * @param {Surface} surf
   */
  draw(surf) {
    surf.ctx.beginPath();
    surf.moveTo(this.left, this.top);
    surf.lineTo(this.left, this.bottom);
    surf.lineTo(this.right, this.bottom);
    surf.lineTo(this.right, this.top);
    surf.lineTo(this.left, this.top);
    surf.ctx.closePath();
    surf.ctx.stroke();

    surf.rotatedText(`${this.id}${this.AB}`, this.width, this.centre, this.middle);
  }
  
  toString() {
    return `Plank ${this.id}${this.AB}`
    + (this.length < params.PLANK_LENGTH ? `<${this.length}>` : "")
    + ` (${this.left},${this.top})`;
  }
}

/**
 * Interface to canvas context, supporting margins and scaling
 */
class Surface {

  static SCALE = 2;
  static MARGIN = 10;

  /**
   * @param {canvas} can canvas
   * @param {number} l eft
   * @param {number} t top
   * @param {number} w width
   * @param {number} h height
   */
  constructor(can, l, t, w, h) {
    this.canvas = can;
    this.scale = Surface.SCALE;
    this.ox = Surface.MARGIN - l, this.oy = Surface.MARGIN - t;
    this.w = w + 2 * Surface.MARGIN, this.h = h + 2 * Surface.MARGIN;
    this.ctx = can.getContext("2d");
    can.height = this.scale * this.h;
    can.width = this.scale * this.w;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  moveTo(x, y) {
    this.ctx.moveTo(this.scale * (x + this.ox),
                    this.scale * (y + this.oy));
  }

  lineTo(x, y) {
    this.ctx.lineTo(this.scale * (x + this.ox),
                    this.scale * (y + this.oy));
  }

  rotatedText(t, h, x, y) {
    surf.ctx.fillStyle = "rgb(0,0,0)";
    surf.ctx.font = `${h}px sanserif`;
    surf.ctx.save();
    surf.ctx.translate(this.scale * (x + this.ox),
                       this.scale * (y + this.oy));
    surf.ctx.rotate(-Math.PI/2);
    surf.ctx.textAlign = 'center';
    surf.ctx.textBaseline = 'middle';
    surf.ctx.fillText(t, 0, 0);
    surf.ctx.restore();
  }
}

/**
 * The vertices that describe the room. The top left of the room
 * diagram is at 0,0. Y coordinates grow downwards, X left to right.
 * The id is used to identify which vertex relates to which
 * room feature.
 */
const vertices = [
  { x: 10.5, y: 189.5, id: "Paris corner" },
  { x: 10.5, y: 180.5, id: "Paris L" },
  { x: 0, y: 180.5, id: "Paris L" },
  { x: 0, y: 106.5, id: "Paris R" },
  { x: 10.5, y: 106.5, id: "Paris R" },
  { x: 10.5, y: 87, id: "Rome L" },
  { x: 0, y: 87, id: "Rome L" },
  { x: 0, y: 13, id: "Rome R" },
  { x: 10.5, y: 13, id: "Rome R" },
  { x: 10.5, y: 10.5, id: "Rome corner" },
  { x: 24, y: 10.5, id: "Bog L" },
  { x: 24, y: 0, id: "Bog L" },
  { x: 98, y: 0, id: "Bog R" },
  { x: 98, y: 10.5, id: "Bog R" },
  { x: 228, y: 10.5, id: "Cup L" },
  { x: 228, y: 5.5, id: "Cup L" },
  { x: 297, y: 5.5, id: "Cup R" },
  { x: 297, y: 10.5, id: "Cup R" },
  { x: 398, y: 10.5, id: "Kit L" },
  { x: 398, y: 0, id: "Kit L" },
  { x: 472, y: 0, id: "Kit R" },
  { x: 472, y: 10.5, id: "Kit R" },
  { x: 482.5, y: 10.5, id: "Kit corner" },
  { x: 482.5, y: 225.5, id: "Liv L" },
  { x: 493, y: 225.5, id: "Liv L" },
  { x: 493, y: 299.5, id: "Liv R" },
  { x: 482.5, y: 299.5, id: "Liv R" },
  { x: 482.5, y: 391.5, id: "Front L" },
  { x: 305, y: 391.5, id: "Front R" },
  { x: 305, y: 376.5, id: "Bulge" },
  { x: 279, y: 376.5, id: "Berlin wall" },
  { x: 279, y: 286.5, id: "Berlin L" },
  { x: 273, y: 286.5, id: "Berlin L" },
  { x: 273, y: 218.5, id: "Berlin R" },
  { x: 279, y: 218.5, id: "Berlin R"},
  { x: 279, y: 189.5, id: "Berlin corner" }
];

// Construct array of horizontal edges that are all aligned
// left-right
const hedges = [];
let leftmost = Number.MAX_SAFE_INTEGER, rightmost = Number.MIN_SAFE_INTEGER,
    topmost = Number.MAX_SAFE_INTEGER, bottommost = Number.MIN_SAFE_INTEGER;
for (let i = 0; i < vertices.length; i++) {
  const p1 = vertices[i];
  leftmost = Math.min(leftmost, p1.x);
  rightmost = Math.max(rightmost, p1.x);
  topmost = Math.min(topmost, p1.y);
  bottommost = Math.max(bottommost, p1.y);
  
  const p2 = vertices[(i + 1) % vertices.length];
  if (p1.y === p2.y) // Horizontal edge
    hedges.push(new HEdge(Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), p1.y));
}

//console.debug(`Leftmost ${leftmost} Rightmost ${rightmost}`);
//console.debug(`Topmost ${topmost} Bottommost ${bottommost}`);

/**
 * Working left to right, create columns and then populate the
 * columns with planks
 * @param {number} left start left
 * @return {Column[]} array of columns
 */
function columnise(left) {
  // Reset plank IDs
  Plank.NEXT = 1;

  let l = left; // left edge of current column
  const columns = [];
  let planksNeeded = 0, cuts = 0, waste = 0;
  let inHand;
  while (l < rightmost) {
    const col = new Column(l);
    columns.push(col);
    for (const hedge of hedges)
      col.limit(hedge);
    
    //console.debug(col.toString());
    let y = col.top; // place to put next plank
    let h = col.height; // amt of this col to fill
    if (inHand) {
      col.planks.push(inHand);
      h -= inHand.length;
      inHand.left = l;
      inHand.top = y;
      y += inHand.length;
      inHand = undefined;
    }
    let fullPlanks = 0;
    while (h > params.PLANK_LENGTH) {
      col.planks.push(new Plank(l, y));
      y += params.PLANK_LENGTH;
      fullPlanks++;
      h -= params.PLANK_LENGTH;
    }
    //console.debug(`\t${fullPlanks} full planks`);
    planksNeeded += fullPlanks;

    if (h > 0) {
      // need to cut a plank
      planksNeeded++;
      cuts++;

      // Make the length at the bottom of this column
      const cp = new Plank(l, y);
      cp.length = h;
      y += h;
      col.planks.push(cp);
      
      // Deal with the excess
      const over = params.PLANK_LENGTH - h - params.CUT_THICKNESS;
      if (over > params.MIN_PLANK_LENGTH) {
        // save the rest of the cut plank
        inHand = new Plank(l, y, cp.id);
        inHand.AB = "b";
        cp.AB = "a";
        inHand.length = over;
        //console.debug(`\t+1 cut to ${h}, ${over.toFixed(1)}cm left over`);
      } else {
        // waste the rest of the cut plank
        //console.debug(`\t+1 cut to ${h}, ${over}cm wasted`);
        waste += over;
      }
    }
    
    l += params.PLANK_WIDTH;
  }
  $("#planksNeeded").text(planksNeeded);
  $("#cuts").text(cuts);
  $("#waste").text(waste.toFixed(1));

  return columns;
}

/**
 * Randomise the order of equal length columns. This is designed to
 * break up staircase effects that happen when you simply lay the
 * planks boustrophedonically.
 */
function shuffle(columns) {
  // collect equal length columns into bins
  const bins = {};
  for (const col of columns) {
    if (!bins[col.height])
      bins[col.height] = [];
    bins[col.height].push(col);
  }

  // Shuffle the columns in each bin
  for (const i of Object.keys(bins)) {
    const bin = bins[i];
    if (bin.length > 1) {
      for (let i = 0; i < 2 * bin.length; i++) {
        const from = Math.floor(Math.random() * bin.length);
        let to = from;
        while (to === from)
          to = Math.floor(Math.random() * bin.length);
        const t = bin[from].left;
        bin[from].left = bin[to].left;
        bin[to].left = t;
        bin[from].lineUpPlanks();
        bin[to].lineUpPlanks();
      }
    }
  }

  // Renumber the planks
  columns.sort((a, b) => {
    return (a.left < b.left) ? -1 : (a.left > b.left) ? 1 : 0;
  });

  let newId = 1;
  const remap = {};
  for (const col of columns) {
    for (const plank of col.planks) {
      if (typeof remap[plank.id] == "undefined") {
        remap[plank.id] = newId++;
      }
      plank.id = remap[plank.id];
    }
  }
}

/**
 * Repaint the canvas with the given columns
 * @param {Column[]} columns of planks
 * @param {Surface} surf drawing context
 */
function repaint(columns, surf) {
  surf.ctx.fillStyle = "rgba(255,165,0,50)";
  surf.ctx.beginPath();
  surf.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    surf.lineTo(vertices[i].x, vertices[i].y);
  }
  surf.lineTo(vertices[0].x, vertices[0].y);
  surf.ctx.closePath();
  surf.ctx.fill();

  for (const col of columns) {
    col.draw(surf);
  }

  // Dump the cutting schedule
  const story = [];
  for (const col of columns) {
    for (const plank of col.planks) {
      if (plank.AB != "")
        story.push(`${plank.id} ${plank.AB} ${plank.length.toFixed(2)}cm`);
    }
  }
  $("#schedule").html(story.sort((a, b) => parseInt(a) - parseInt(b)).join("<br>"));
}

let columns;

/**
 * Recompute the layout and redisplay
 * @param {Surface} surf drawing context
 */
function reFloor(surf) {
  columns = columnise(leftmost + params.START_LEFT);
  shuffle(columns);
  surf.clear();
  repaint(columns, surf);
}

const surf = new Surface(
  $("#floor")[0],
  leftmost, topmost, rightmost - leftmost, bottommost - topmost);

for (const key of Object.keys(params)) {
  params[key] = Number($(`#${key}`).val());
  $(`#${key}`).on("change", function() {
    //console.debug(this.id,this.value);
    params[this.id] = Number(this.value);
    reFloor(surf);
  });
}

reFloor(surf);

$("#dump_room").on("click", () => {
  // Dump the dimensions of each edge, useful to double-check
  // room measurements
  for (let i = 0; i < vertices.length - 1; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    console.log(`${v1.id}->${v2.id} ${len}`);
  }
});
