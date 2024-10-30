/* Copyright 2024 Crawford Currie */

/**
 * Class of horizontal edges. We're only interested in this subset of
 * the room polygon, because these are the edges that limit board length.
 */
class HEdge {

  /*
   * @param {object|number} left copy object or left end of the edge
   * @param {number} right right end of the edge
   * @param {number} y level of the edge
   */
  constructor(left, right, y) {
    if (typeof left === "object") {
      y = left.y;
      right = left.right;
      left = left.left;
    }
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
 * Planks are laid into columns
 */
class Plank {

  static NEXT = 1;

  /**
   * @param {object|number} left copy object or left of the plank
   * @param {number} top top of the plank
   * @param {number} width width of the plank
   * @param {number} length top of the plank
   * @param {string} id identifier for the plank
   */
  constructor(left, top, width, length, id) {
    if (typeof left === "object") {
      this.id = left.id;
      this.TB = left.TB;
      this.left = left.left;
      this.top = left.top;
      this.width = left.width;
      this.length = left.length;      
    } else {
      // Identified for this plank
      this.id = id ?? Plank.NEXT++;
      // Which side of a cut this plank is (blank if it's a whole plank)
      this.TB = "";
      // Where the plank is
      this.left = left;
      this.top = top;
      // How big it is
      this.width = width;
      this.length = length;
    }
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

    surf.rotatedText(`${this.id}${this.TB}`, this.width, this.centre, this.middle);
  }
  
  toString() {
    return `Plank ${this.id}${this.TB}<${this.length}> (${this.left},${this.top})`;
  }
}

/**
 * The room is divided left-to-right into columns, each the width of
 * a plank. Then the planks are laid into each column.
 */
class Column {

  /**
   * @param {object|number} left copy object or left of column
   * @param {number?} width
   */
  constructor(left, width) {
    // Planks in this column
    this.planks = [];
    let top = Number.MAX_SAFE_INTEGER;
    let bottom = Number.MIN_SAFE_INTEGER;

    if (typeof left === "object") {
      width = left.width;
      top = left.top;
      bottom = left.bottom;
      for (const plank of left.planks)
        this.planks.push(new Plank(plank));
      left = left.left;
    }

    this.left = left;
    this.width = width;
    this.top = top;
    this.bottom = bottom;
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

  get right() {
    return this.left + this.width;
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
 * Interface to canvas context, supporting margins and scaling
 */
class Surface {

  static SCALE = 2;
  static MARGIN = 10;

  /**
   * @param {canvas} can canvas
   */
  constructor(can) {
    this.canvas = can;
    this.scale = Surface.SCALE;
    this.ctx = can.getContext("2d");
  }

  /**
   * Resize the surface, to accomodate a different sized room.
   * @param {number} l eft
   * @param {number} t top
   * @param {number} w width
   * @param {number} h height
   */
  resize(l, t, w, h) {
    this.ox = Surface.MARGIN - l, this.oy = Surface.MARGIN - t;
    this.w = w + 2 * Surface.MARGIN, this.h = h + 2 * Surface.MARGIN;
    this.canvas.height = this.scale * this.h;
    this.canvas.width = this.scale * this.w;
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
    this.ctx.fillStyle = "rgb(0,0,0)";
    this.ctx.font = `${h}px sans-serif`;
    this.ctx.save();
    this.ctx.translate(this.scale * (x + this.ox),
                       this.scale * (y + this.oy));
    this.ctx.rotate(-Math.PI/2);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(t, 0, 0);
    this.ctx.restore();
  }
}

class Room {

  /**
   * Names and defaults for parameters coming from HTML. These are written
   * into the object.
   */
  static PARAMS = {
    START_LEFT: 0,
    PLANK_WIDTH: 10,
    PLANK_LENGTH: 60,
    CUT_THICKNESS: 0.5,
    MIN_PLANK_LENGTH: 20
  };

  /**
   * @param {Object} template
   * @param {object[]} template.vertices required, the vertices that
   * describe the room, an array of tuples {x:, y:, id:} The top left
   * of the room diagram is at 0,0. Y coordinates grow downwards, X
   * left to right.  The id is used to identify which vertex relates
   * to which room feature.
   * The rest of the template object is used to provide values for
   * other fields in the object when loading from JSON.
   */
  constructor(template = {}) {
    this.vertices = template.vertices ?? [];

    for (const key of Object.keys(Room.PARAMS)) {
      this[key] = template[key] ?? Room.PARAMS[key];
      $(`#${key}`).val(this[key]);
    }

    /**
     * Array of horizontal edges that are all aligned
     * left-right
     * @member {HEdge[]}
     */
    this.hedges = [];
    for (const hedge of template.hedges)
      this.hedges.push(new HEdge(hedge));
    this.columns = [];
    for (const col of template.columns)
      this.columns.push(new Column(col));
    this.leftmost = template.leftmost ?? Number.MAX_SAFE_INTEGER;
    this.rightmost = template.rightmost ?? Number.MIN_SAFE_INTEGER;
    this.topmost = template.topmost ?? Number.MAX_SAFE_INTEGER;
    this.bottommost = template.bottommost ?? Number.MIN_SAFE_INTEGER;
    console.log("Loaded", this);
  }

  /**
   * Construct hedges, dimensions, surface from room vertices
   * @private
   */
  measure() {
    this.hedges = [];

    this.leftmost = Number.MAX_SAFE_INTEGER;
    this.rightmost = Number.MIN_SAFE_INTEGER;
    this.topmost = Number.MAX_SAFE_INTEGER;
    this.bottommost = Number.MIN_SAFE_INTEGER;

    for (let i = 0; i < this.vertices.length; i++) {
      const p1 = this.vertices[i];
      this.leftmost = Math.min(this.leftmost, p1.x);
      this.rightmost = Math.max(this.rightmost, p1.x);
      this.topmost = Math.min(this.topmost, p1.y);
      this.bottommost = Math.max(this.bottommost, p1.y);
    
      const p2 = this.vertices[(i + 1) % this.vertices.length];
      if (p1.y === p2.y) // Horizontal edge
        this.hedges.push(new HEdge(Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), p1.y));
    }

    //console.debug(`Leftmost ${leftmost} Rightmost ${rightmost}`);
    //console.debug(`Topmost ${topmost} Bottommost ${bottommost}`);
  }

  /**
   * Working left to right, create columns and then populate the
   * columns with planks
   * @private
   */
  columnise() {
    // Reset plank IDs
    Plank.NEXT = 1;

    let l = this.leftmost + this.START_LEFT; // left edge of current column
    const columns = [];
    let planksNeeded = 0, cuts = 0, waste = 0;
    let inHand;
    while (l < this.rightmost) {
      const col = new Column(l, this.PLANK_WIDTH);
      columns.push(col);
      for (const hedge of this.hedges)
        col.limit(hedge);
    
      //console.debug(col.toString());
      let y = col.top; // place to put next plank
      let h = col.height; // amt of this col to fill
      let startedWith = this.PLANK_LENGTH;
      if (inHand) {
        col.planks.push(inHand);
        h -= inHand.length;
        inHand.left = l;
        inHand.top = y;
        y += inHand.length;
        startedWith = inHand.length;
        inHand = undefined;
      }
      let fullPlanks = 0;
      while (h > this.PLANK_LENGTH) {
        col.planks.push(new Plank(l, y, this.PLANK_WIDTH, this.PLANK_LENGTH));
        y += this.PLANK_LENGTH;
        fullPlanks++;
        h -= this.PLANK_LENGTH;
      }

      // If we need to cut a plank, and that would result in a cut that's
      // too short, and we started this column with a cut, go back
      // and try again starting the column with a full plank.
      // SMELL: alternatively, cut the inHand plank in three?
      if (h > 0 && h < this.MIN_PLANK_LENGTH
          && startedWith < this.PLANK_LENGTH) {
        waste += startedWith;
        columns.pop();
        continue;
      }

      //console.debug(`\t${fullPlanks} full planks`);
      planksNeeded += fullPlanks;

      if (h > 0) {
        planksNeeded++;
        cuts++;

        // Make the length at the bottom of this column
        const cp = new Plank(l, y, this.PLANK_WIDTH, h);
        y += h;
        col.planks.push(cp);
      
        // Deal with the excess
        const over = this.PLANK_LENGTH - h - this.CUT_THICKNESS;
        waste += this.CUT_THICKNESS;
        if (over > this.MIN_PLANK_LENGTH) {
          // save the rest of the cut plank
          inHand = new Plank(l, y, this.PLANK_WIDTH, over, cp.id);
          inHand.TB = ">";
          cp.TB = "<";
          //console.debug(`\t+1 cut to ${h}, ${over.toFixed(1)}cm left over`);
        } else {
          // waste the rest of the cut plank
          //console.debug(`\t+1 cut to ${h}, ${over}cm wasted`);
          cp.TB = ">";
          waste += over;
        }
      }
    
      l += this.PLANK_WIDTH;
    }
    $("#planksNeeded").text(planksNeeded);
    $("#cuts").text(cuts);
    $("#waste").text(waste.toFixed(1));

    this.columns = columns;
  }

  /**
   * Randomise the order of equal length columns. This is designed to
   * break up staircase effects that happen when you simply lay the
   * planks boustrophedonically.
   * @private
   */
  shuffle() {
    console.debug("Shuffling");
    // collect equal length columns into bins
    const bins = {};
    for (const col of this.columns) {
      if (!bins[col.height])
        bins[col.height] = [];
      bins[col.height].push(col);
    }

    // Shuffle the columns in each bin
    for (const i of Object.keys(bins)) {
      const bin = bins[i];
      if (bin.length > 1) {
        for (let i = 0; i < 2 * bin.length; i++) {
          const from = i % bin.length;
          let to = from;
          while (to == from)
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
    this.columns.sort((a, b) => {
      return (a.left < b.left) ? -1 : (a.left > b.left) ? 1 : 0;
    });

    let newId = 1;
    const remap = {};
    for (const col of this.columns) {
      for (const plank of col.planks) {
        if (typeof remap[plank.id] == "undefined") {
          remap[plank.id] = newId++;
        }
        plank.id = remap[plank.id];
      }
    }
  }

  /**
   * Format the cutting schedule. The schedule is returned as an array
   * of objects, each being a pair of strings, one for the bottom end of
   * the plank and the other for the top end.
   * @return {{"<":string,">":string}[]} cutting schedule
   */
  cuttingSchedule() {
    const cuts = [];
    for (const col of this.columns) {
      for (const plank of col.planks) {
        if (plank.TB != "") {
          if (!cuts[plank.id])
            cuts[plank.id] = {};
          let cut;
          if (plank.TB == "<")
            cut = `${plank.id}< ${plank.length.toFixed(1)}`;
          else
            cut = `${plank.length.toFixed(1)} ${plank.id}>`;
          cuts[plank.id][plank.TB] = cut;
        }
      }
    }
    return cuts;
  }

  /**
   * Repaint the canvas with the given columns
   * @param {Surface} surf drawing context
   */
  repaint(surf) {
    surf.clear();

    if (this.vertices.length < 3)
      // Need at least 3 vertices to make a rectilinear room.
      return;

    surf.ctx.fillStyle = "rgba(255,165,0,50)";
    surf.ctx.beginPath();
    surf.moveTo(this.vertices[0].x, this.vertices[0].y);
    for (let i = 1; i < this.vertices.length; i++)
      surf.lineTo(this.vertices[i].x, this.vertices[i].y);

    surf.lineTo(this.vertices[0].x, this.vertices[0].y);
    surf.ctx.closePath();
    surf.ctx.fill();

    for (const col of this.columns)
      col.draw(surf);

    // Dump the cutting schedule
    const sched = this.cuttingSchedule()
          .filter(cut => typeof cut !== "undefined")
          .map(cut => `${cut["<"]} | ${cut[">"]}`);
    $("#schedule").html(sched.join("<br>"));
  }

  /**
   * Recompute the layout and redisplay. Used when parameters change
   * (though the floor doesn't)
   */
  recomputeFloor() {
    // Construct and fill columns with planks
    this.columnise();
  }
}

let room;
const surf = new Surface($("#floor")[0]);

function loadRoom(file) {
  console.log(`Loading ${file}`);
  return $.get(file, data => {
    room = new Room(data);
    if (room.columns.length === 0) {
      room.measure();
      room.recomputeFloor();
    }
    surf.resize(
      room.leftmost, room.topmost,
      room.rightmost - room.leftmost, room.bottommost - room.topmost);
    room.repaint(surf);
    return room;
  });
}

$("#try_again")
.on("click", () => {
  room.recomputeFloor();
  room.repaint(surf);
});

$("#shuffle")
.on("click", () => {
  // shuffle columns to avoid staircases
  room.shuffle();
  room.repaint(surf);
});

$("#save_room")
.on("click", () => {
  // Creating a blob object from non-blob data using the Blob constructor
  const blob = new Blob([ JSON.stringify(room) ],
                        { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = $("<a></a>");
  a[0].href = url;
  a[0].download = "room.json";
  $("body").append(a);
  a[0].click();
  $("body").remove(a);
});

for (const key of Object.keys(Room.PARAMS)) {
  $(`#${key}`).on("change", function() {
    //console.debug(this.id,this.value);
    room[this.id] = Number(this.value);
    room.recomputeFloor();
    room.repaint(surf);
  });
}

$("#room_file").on("change", function () {
  if (this.files[0] == undefined)
    return;
  loadRoom(this.files[0].name);
});

const room_file = $("#room_file")[0];
if (room_file.files[0])
  loadRoom(room_file.files[0].name);
