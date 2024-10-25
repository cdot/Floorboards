/* Copyright 2024 Crawford Currie */

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

  constructor(left, width) {
    this.left = left;
    this.width = width;
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
 * Planks are laid into columns
 */
class Plank {

  static NEXT = 1;

  /**
   * @param {number} left left of the plank
   * @param {number} top top of the plank
   * @param {string} id identifier for the plank
   */
  constructor(left, top, width, length, id) {
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

class Floorboards {

  /**
   * Names of parameters coming from HTML. These are written
   * into the object.
   */
  static PARAMS = [
    "START_LEFT",
    "PLANK_WIDTH",
    "PLANK_LENGTH",
    "CUT_THICKNESS",
    "MIN_PLANK_LENGTH"
  ];

  /**
   * @param {Object[]} vertices the vertices that describe the room,
   * an array of tuples {x:, y:, id:} The top left of the room
   * diagram is at 0,0. Y coordinates grow downwards, X left to right.
   * The id is used to identify which vertex relates to which
   * room feature.
   */
  constructor(vertices) {
    this.vertices = [];

    /**
     * Array of horizontal edges that are all aligned
     * left-right
     * @member {HEdge[]}
     */
    this.hedges = [];
    this.leftmost = Number.MAX_SAFE_INTEGER;
    this.rightmost = Number.MIN_SAFE_INTEGER;
    this.topmost = Number.MAX_SAFE_INTEGER;
    this.bottommost = Number.MIN_SAFE_INTEGER;
    this.surf = new Surface($("#floor")[0]);
    if (vertices)
      this.loadRoom(vertices);
  }

  /**
   * Load floorboards with a new room
   * @param {Object[]} vertices the vertices that describe the room,
   * see the constructor
   */
  loadRoom(vertices) {
    if (!Array.isArray(vertices)
        || typeof vertices[0] != "object"
        || typeof vertices[0].x != "number"
        || typeof vertices[0].y != "number")
      throw new Error("Not vertices");

    this.vertices = vertices;

    this.hedges = [];
 
    this.leftmost = Number.MAX_SAFE_INTEGER;
    this.rightmost = Number.MIN_SAFE_INTEGER;
    this.topmost = Number.MAX_SAFE_INTEGER;
    this.bottommost = Number.MIN_SAFE_INTEGER;

    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i];
      this.leftmost = Math.min(this.leftmost, p1.x);
      this.rightmost = Math.max(this.rightmost, p1.x);
      this.topmost = Math.min(this.topmost, p1.y);
      this.bottommost = Math.max(this.bottommost, p1.y);
    
      const p2 = vertices[(i + 1) % vertices.length];
      if (p1.y === p2.y) // Horizontal edge
        this.hedges.push(new HEdge(Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), p1.y));
    }

    this.surf.resize(
      this.leftmost, this.topmost,
      this.rightmost - this.leftmost, this.bottommost - this.topmost);

    //console.debug(`Leftmost ${leftmost} Rightmost ${rightmost}`);
    //console.debug(`Topmost ${topmost} Bottommost ${bottommost}`);
    this.recomputeFloor();
    this.repaint();
  }

  /**
   * Working left to right, create columns and then populate the
   * columns with planks
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
      if (inHand) {
        col.planks.push(inHand);
        h -= inHand.length;
        inHand.left = l;
        inHand.top = y;
        y += inHand.length;
        inHand = undefined;
      }
      let fullPlanks = 0;
      while (h > this.PLANK_LENGTH) {
        col.planks.push(new Plank(l, y, this.PLANK_WIDTH, this.PLANK_LENGTH));
        y += this.PLANK_LENGTH;
        fullPlanks++;
        h -= this.PLANK_LENGTH;
      }
      //console.debug(`\t${fullPlanks} full planks`);
      planksNeeded += fullPlanks;

      if (h > 0) {
        // need to cut a plank
        planksNeeded++;
        cuts++;

        // Make the length at the bottom of this column
        const cp = new Plank(l, y, this.PLANK_WIDTH, h);
        y += h;
        col.planks.push(cp);
      
        // Deal with the excess
        const over = this.PLANK_LENGTH - h - this.CUT_THICKNESS;
        if (over > this.MIN_PLANK_LENGTH) {
          // save the rest of the cut plank
          inHand = new Plank(l, y, this.PLANK_WIDTH, over, cp.id);
          inHand.TB = ">";
          cp.TB = "<";
          //console.debug(`\t+1 cut to ${h}, ${over.toFixed(1)}cm left over`);
        } else {
          // waste the rest of the cut plank
          //console.debug(`\t+1 cut to ${h}, ${over}cm wasted`);
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
   */
  shuffle() {
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
   * Repaint the canvas with the given columns
   * @param {Surface} surf drawing context
   */
  repaint() {
    this.surf.clear();

    this.surf.ctx.fillStyle = "rgba(255,165,0,50)";
    this.surf.ctx.beginPath();
    this.surf.moveTo(this.vertices[0].x, this.vertices[0].y);
    for (let i = 1; i < this.vertices.length; i++)
      this.surf.lineTo(this.vertices[i].x, this.vertices[i].y);

    this.surf.lineTo(this.vertices[0].x, this.vertices[0].y);
    this.surf.ctx.closePath();
    this.surf.ctx.fill();

    for (const col of this.columns) {
      col.draw(this.surf);
    }

    // Dump the cutting schedule
    const story = [];
    for (const col of this.columns) {
      for (const plank of col.planks) {
        if (plank.TB != "")
          story.push(`${plank.id} ${plank.TB} ${plank.length.toFixed(2)}cm`);
      }
    }
    $("#schedule").html(story.sort((a, b) => parseInt(a) - parseInt(b)).join("<br>"));
  }

  /**
   * Recompute the layout and redisplay. Used when parameters change
   * (though the floor doesn't)
   */
  recomputeFloor() {
    // Construct and fill columns with planks
    this.columnise();
    // shuffle columns to avoid staircases
    this.shuffle();
  }

  /**
   * Dump the dimensions of each edge in the room, useful to double-check
   * room measurements
   * @return {string[]} array of edge descriptions
   */
  dumpRoom() {
    const dump = [];
    for (let i = 0; i < this.vertices.length - 1; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[(i + 1) % this.vertices.length];
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      dump.push(`${v1.id}->${v2.id} ${len}`);
    }
    return dump;
  }
}

let floorboards = new Floorboards();

$("#dump_room")
.on("click", () => console.log(floorboards.dumpRoom().join("\n")));

for (const key of Floorboards.PARAMS) {
  floorboards[key] = Number($(`#${key}`).val());
  $(`#${key}`).on("change", function() {
    //console.debug(this.id,this.value);
    floorboards[this.id] = Number(this.value);
    floorboards.recomputeFloor();
    floorboards.repaint();
  });
}

$("#room_file").on("change", function() {
  if (this.files[0] == undefined)
    return;
  $.get(this.files[0].name,
        vertices => {
        try {
          floorboards.loadRoom(vertices);
        } catch (e) { alert(e); }
        });
});

$.get($("#room_file")[0].files[0].name,
      vertices => {
        try {
          floorboards.loadRoom(vertices);
        } catch (e) { alert(e); }
      });

