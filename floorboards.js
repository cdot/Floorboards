/* Copyright 2024 Crawford Currie */
/* eslint-env browser, jquery */
/* global $, SVG */
// See README.md

/*
 * Problem: given a rectilinear room and an unlimited supply of
 * interlocking boards all the same size, some of which may be pre-cut, lay
 * the boards out to meet the following constraints:
 * 1. Respect the interlocking, so cut ends always butt the edges of
 *    the room poly.
 * 2. Minimum wastage of board length
 * 3. Minimum number of cross-cuts
 * 4. Minimise plank joins lining up in adjacent plank runs
 * 5. Minimise "staircase effects", where lines of planks have
 *    the same offset from each other.
 * 7. Support starting the planking at an arbitrary offset within the
 *    room.
 *
 * Approach:
 * 1. Describe the room as a polygon using a set of vertices.
 * 2. Divide the room into a set of equal-width columns.
 * 3. Limit the height of each column by examining where it crosses
 *    the room poly.
 * 4. Starting with the left column, and preferring pre-cut planks,
 *    lay planks until the column is full.  Where the last plank
 *    crosses the end of the column, cut the plank and add the cut
 *    part to the set of pre-cut planks.
 * 5. Repeat 4 until the room is full.
 *
 * Post-layout, allow the random shuffling of columns to minimise
 * staircase and matching seam problems (based on visual feedback).
 *
 * As you can see, the algorithm is quite simple. In the course of
 * this work I explored several options for more sophisticated
 * approaches using cost functions and stochastic algorithms. However
 * I abandoned that when the need to put saw to wood became paramount,
 * and I realised that visual feedback was a perfectly acceptable way
 * to handle the problem.
 */

/**
 * Class of horizontal edges. We're only interested in this subset of
 * the room polygon, because these are the edges that limit board length.
 */
class HEdge {

  /*
   * @param {HEdge|object} attrs attributes
   * @param {number} attrs.left end of the edge
   * @param {number} attrs.right right end of the edge
   * @param {number} attrs.y level of the edge
   */
  constructor(attrs) {
    /**
     * Left end of this edge
     * @member {number}
     */
    this.left = attrs.left ?? 0;

    /**
     * Right end of this edge
     * @member {number}
     */
    this.right = attrs.right ?? 0;

    /**
     * Y for this edge
     * @member {number}
     */
    this.y = attrs.y ?? 0;
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
  static UID = 0;

  /**
   * @param {Plank|object} attrs plank attributes
   * @param {number} attrs.left left of the plank
   * @param {number} attrs.top top of the plank
   * @param {number} attrs.width width of the plank
   * @param {number} attrs.length top of the plank
   * @param {string} attrs.id identifier for the plank
   * @param {string} attrs.cut_end cut end, "" (neither end), ">" (top end) or
   * "<" (bottom end)
   * @param {boolean} attrs.permanent true if the plank has
   * to be retained in the partial plank set on re-layout
   */
  constructor(attrs) {
    /**
     * Internal ID for plank, used to identify planks
     */
    this.uid = Plank.UID++;

    /**
     * User identifier for this plank, a simple number
     * @member {number}
     */
    this.id = attrs.id ?? Plank.NEXT++;

    /**
     * Which end of this plank is cut (blank if it's a whole plank)
     * @member {string}
     */
    this.cut_end = attrs.cut_end ?? "";

    /**
     * Where the plank is. This will be 0 until the plank is actually
     * placed.
     * @member {number}
     */
    this.left = attrs.left ?? 0;

    /**
     * Where the plank is. This will be 0 until the plank is actually
     * placed.
     * @member {number}
     */
    this.top = attrs.top ?? 0;

    /**
     * How big it is. All planks will be the same width as the
     * column (which will be Room.PLANK_WIDTH). This is just to save
     * going back to the column for that number.
     * @member {number}
     */
    this.width = attrs.width ?? 0;

    /**
     * Length of this piece of plank
     * @member {number}
     */
    this.length = attrs.length ?? 0;

    /**
     * If the plank has to be retained in the partial plank set on re-layout.
     * Permanent partials are added by the user and are assumed to be required
     * between layout runs.
     */
    this.permanent = attrs.permanent ?? false;
  }

  get bottom() { return this.top + this.length; }

  get middle() { return this.top + this.length / 2; }

  get right() { return this.left + this.width; }

  get centre() { return this.left + this.width / 2; }

  /**
   * @param {Surface} surf
   */
  draw(surf) {
    // Create a group to hold the plank and the ID string. This is
    // only done to make it easier to manipulate in an exported SVG.
    surf.openGroup();

    // Draw the plank
    const colour = this.permanent ? "red" : "none";
    surf.drawRect(this.left, this.top, this.width, this.length)
    .fill({ color: colour, opacity: 0.1 })
    .stroke({ color: "black", opacity: 0.1, width: 1 });

    // Annotate with the ID
    const fore = this.cut_end == "<" ? "<" : "";
    const aft = this.cut_end == ">" ? ">" : "";
    surf.drawText(
      `${fore}${this.id}${aft}`,
      this.centre, this.middle, 3 * this.width / 4, -90);

    surf.closeGroup();
  }
  
  toString() {
    return `${this.id} ${this.cut_end} ${this.length}cm`;
  }

  /**
   * Generate HTML to show the plank in the partials list
   * @return {jQuery} reference to generated element
   */
  html() {
    const cut_at = this.cut_end == "<" ? ", cut at bottom"
          : this.cut_end == ">" ? ", cut at top" : "";
    const $p = $(`<div>Plank ${this.id}, length ${this.length.toFixed(1)} ${cut_at} ${this.permanent ? "(user)" : ""} </div>`);
    const $b = $(`<button data-uid="${this.uid}">remove</button>`);
    $p.append($b);
    return $p;
  }
}

/**
 * The room is divided left-to-right into columns, each the width of
 * a plank. Then the planks are laid into each column.
 */
class Column {

  /**
   * @param {Column|object} attrs attributes
   * @param {number} attrs.width width of the column
   * @param {number} attrs.left left edge of the column
   * @param {number} attrs.top top of the column
   * @param {number} attrs.bottom bottom of the column
   * @param {Plank[]} attrs.planks planks in the column
   */
  constructor(attrs = {}) {
    /**
     * left edge of the column
     * @member {number}
     */
    this.left = attrs.left ?? 0;

    /**
     * width of the column
     * @member {number}
     */
    this.width = attrs.width ?? 0;

    /**
     * top of the column (min y)
     * @member {number}
     */
    this.top = attrs.top ?? Number.MAX_SAFE_INTEGER;

    /**
     * bottom of the column (max y)
     * @member {number}
     */
    this.bottom = attrs.bottom ?? Number.MIN_SAFE_INTEGER;;

    /**
     * planks in the column
     * @member {Plank[]}
     */
    this.planks = [];
    if (attrs.planks)
      for (const plank of attrs.planks)
        this.planks.push(new Plank(plank));
  }

  /**
   * Check if a horizontal edge imposes a limit on the top/bottom
   * of our column, and clip the column accordingly.
   * @param {HEdge} hedge the edge
   */
  clip(hedge) {
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
 * A drawing surface, using SVG.
 */
class Surface {

  static SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * @param {jQuery} $container svg container
   */
  constructor($container) {
    /**
     * HTML element that contains the SVG object
     * @member {Element}
     * @private
     */
    this.svg_div = $container[0];

    /**
     * SVG object
     * @member {SVG}
     * @private
     */
    this.svg = SVG();
    this.svg.addTo(this.svg_div);

    /**
     * Width of drawing area
     * @member {number}
     * @private
     */
    this.w = 0;

    /**
     * Height of drawing area
     * @member {number}
     * @private
     */
    this.h = 0;

    /**
     * Margin around drawing area
     * @member {number}
     * @private
     */
    this.margin = 0;

    /**
     * Currently open group
     * @member {SVGGroup}
     * @private
     */
    this.group = undefined;
  }

  /**
   * Clear the drawing
   */
  clear() {
    this.svg.clear();
  }
  
  /**
   * Resize the surface, to accomodate a different sized room.
   * @param {number} l eft
   * @param {number} t top
   * @param {number} w width
   * @param {number} h height
   * @param {number} m margin
   */
  resize(l, t, w, h, m) {
    this.w = w, this.h = h, this.margin = m;
    this.svg_div.width = this.w + 2 * m;
    this.svg_div.height = this.h + 2 * m;
    this.svg.size("100%", "100%");
    this.svg.viewbox(0, 0, this.w + 2 * m, this.h + 2 * m);
  }

  /**
   * Generate a image/svg+xml blob
   */
  blob() {
    return new Blob([ this.svg.svg() ], { type: 'image/svg+xml' });
  }

  /**
   * Open a group. Drawing operations will be added to the
   * group until it is closed.
   */
  openGroup() {
    this.group = this.svg.group();
  }

  /**
   * Close the currently open group
   */
  closeGroup() {
    this.group = undefined;
  }

  /**
   * Draw rectangle
   * @param {number} x left edge
   * @param {number} top top edge
   * @param {number} w width
   * @param {number} h height
   * @return {SVG.Rect} svg rectangle object
   */
  drawRect(x, y, w, h) {
    return (this.group ?? this.svg)
    .rect(w, h)
    .move(x + this.margin, y + this.margin);
  }

  /**
   * Draw text centred at a position
   * @param {string} s text string
   * @param {number} top top edge
   * @param {number} x x coord of centre
   * @param {number} y y coord of centre
   * @param {number} f font size
   * @param {number} r rotation degrees. text is rotated about its centre
   * @return {SVGRect} svg rectangle object
   */
  drawText(s, x, y, f, r = 0) {
    return (this.group ?? this.svg)
    .text(s)
    .font({
      family: 'sans-serif',
      size: f,
      anchor: 'middle'
    })
    .transform({
      rotate: r,
      origin: "center center",
      translate: [ x + this.margin, y + this.margin ]
    });
  }

  /**
   * Draw a polygon
   * @param {object.<x:number,y:number>} polygon vertices
   */
  drawPolygon(vertices) {
    const poly = [];
    for (let i = 0; i < vertices.length; i++)
      poly.push(`${vertices[i].x + this.margin},${vertices[i].y + this.margin}`);
    return (this.group ?? this.svg).polygon(poly.join(" "));
  }
}

/**
 * A room, and the planks required to.... plank it.
 */
class Room {

  /**
   * Names and defaults for parameters coming from HTML. These are written
   * into the object.
   */
  static PARAMS = {
    START_LEFT: 0,
    START_TOP: 0,
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
     * Array of horizontal edges
     * @member {HEdge[]}
     */
    this.hedges = [];
    if (template.hedges)
      for (const hedge of template.hedges)
        this.hedges.push(new HEdge(hedge));

    /**
     * List of columns, ordered left-right, each with a list of Planks
     * @member {Column[]}
     */
    this.columns = [];
    if (template.columns)
      for (const col of template.columns)
        this.columns.push(new Column(col));

    /**
     * Left edge of the bounding rect
     * @member {number}
     */
    this.leftmost = template.leftmost ?? Number.MAX_SAFE_INTEGER;

    /**
     * Right edge of the bounding rect
     * @member {number}
     */
    this.rightmost = template.rightmost ?? Number.MIN_SAFE_INTEGER;

    /**
     * Top edge of the bounding rect
     * @member {number}
     */
    this.topmost = template.topmost ?? Number.MAX_SAFE_INTEGER;

    /**
     * Bottom edge of the bounding rect
     * @member {number}
     */
    this.bottommost = template.bottommost ?? Number.MIN_SAFE_INTEGER;

    /**
     * List of partial (pre-cut) planks left in hand after
     * the most recent recompute
     * @member {Plank[]}
     */
    this.partials = [];
    if (template.partials)
      for (const plank of template.partials)
        this.partials.push(new Plank(plank));

    /**
     * Total number of planks needed, computed on the fly during
     * computation
     * @member {number}
     */
    this.planksNeeded = template.planksNeeded ?? 0;

    /**
     * Total number of cuts needed, computed on the fly during
     * computation
     * @member {number}
     */
    this.cuts = template.cuts ?? 0;

    /**
     * Total waste, in cm of plank length, computed on the fly during
     * computation
     * @member {number}
     */
    //this.waste = template.waste ?? 0;

    if (this.columns.length === 0) {
      this.measure();
      this.recomputeFloor();
    }
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
        this.hedges.push(
          new HEdge({
            left: Math.min(p1.x, p2.x),
            right: Math.max(p1.x, p2.x),
            y: p1.y
          }));
    }
  }

  /**
   * Select a partial plank to start a new column with from the set of
   * partials. The selection is based on minimising the number of cuts
   * and waste.
   */
  selectPartial(cut_end, min_length = 0) {
    let best = -1;
    let bl = Number.MIN_SAFE_VALUE;
    for (let i = 0; i < this.partials.length; i++) {
      const partial = this.partials[i];
      if (partial.cut_end == cut_end && partial.length > min_length) {
        if (best < 0 || partial.length > bl) {
          best = i;
          bl = partial.length;
        }
      }
    }
    if (best < 0)
      return undefined;

    return this.partials.splice(best, 1)[0];
  }

  /**
   * Clear all partials out of the partials list and
   * from columns
   */
  clearPartials() {
    this.partials = [];

    for (const col of this.columns) {
      for (let i = 0; i < col.planks.length; ) {
        if (col.planks[i].permanent)
          col.planks.splice(i, 1);
        else
          i++;
      }
    }
  }

  get waste() {
    let columnage = 0;
    for (const col of this.columns)
      columnage += col.height;
    return this.planksNeeded * this.PLANK_LENGTH - columnage;
  }

  /**
   * Collect all permanent partials into the partials array, delete
   * all other partials.
   */
  collectPermanentPartials() {
    const nPartials = [];
    for (const p of this.partials)
      if (p.permanent)
        nPartials.push(p);

    for (const col of this.columns)
      for (const plank of col.planks)
        if (plank.permanent)
          nPartials.push(plank);

    for (const plank of nPartials)
      plank.id = Plank.NEXT++;

    this.partials = nPartials;
  }

  /**
   * Remove a partial identified by UID. The partial might be resting in
   * the partials list, or already employed in the layout.
   * @param {number} uid unique id of the plank to remove
   */
  removePartial(uid) {
    for (let i = 0; i < this.partials.length; i++) {
      const plank = this.partials[i];
      if (plank.uid === uid) {
        this.partials.splice(i, 1);
        return plank;
      }
    }

    for (const col of this.columns) {
      for (let i = 0; i < col.planks.length; i++) {
        const plank  = col.planks[i];
        if (plank.uid === uid) {
          col.planks.splice(i, 1);
          return plank;
        }
      }
    }

    return undefined; // partial wasn't found
  }

  /**
   * Working left to right, create columns and then populate the
   * columns with planks
   */
  recomputeFloor() {
    // Reset plank IDs
    Plank.NEXT = 1;

    // Retain permanent partials, discard all others
    this.collectPermanentPartials();

    let l = this.leftmost + this.START_LEFT; // left edge of current column
    const columns = [];
    this.columns = columns,
    this.planksNeeded = 0,
    //this.waste = 0,
    this.cuts = 0;
    // offset from the top of the column
    let first_offset = this.START_TOP;
    // Can we start the column with a partial?
    let pickPartial = true;

    while (l < this.rightmost) {
      const col = new Column({ left: l, width: this.PLANK_WIDTH });
      columns.push(col);
      for (const hedge of this.hedges)
        col.clip(hedge);  
      let y = col.top + first_offset; // place to put next plank
      let h = col.height - first_offset; // amt of this col to fill
      first_offset = 0;
      let partial;
      if (pickPartial) {
        partial = this.selectPartial(">");
        if (partial) {
          col.planks.push(partial);
          h -= partial.length;
          partial.left = l;
          partial.top = y;
          y += partial.length;
        }
      }
      let fullPlanks = 0;
      while (h > this.PLANK_LENGTH) {
        col.planks.push(new Plank({
          left: l, top: y,
          width: this.PLANK_WIDTH, length: this.PLANK_LENGTH
        }));
        y += this.PLANK_LENGTH;
        fullPlanks++;
        h -= this.PLANK_LENGTH;
      }
      
      // If we need to cut a plank, and that would result in a cut that's
      // too short, and we started this column with a cut, go back
      // and try again starting the column with a full plank.
      // SMELL: alternatively, cut the partial plank in three?
      if (h > 0 && h < this.MIN_PLANK_LENGTH && partial) {
        this.partials.push(partial);
        columns.pop(); // try this column again
        pickPartial = false;
        continue;
      }

      this.planksNeeded += fullPlanks;

      if (h > 0) {
        // We haven't filled the column with whole planks, so we need
        // to cut a new plank. Part of the plank will be used in this
        // column, and the other part added to the partials for future
        // columns.

        // See if we've got a partial that might do
        if (pickPartial) {
          const base_partial = this.selectPartial("<");
          if (base_partial)
            if (base_partial.length >= h) {
              console.log("Found a base partial");
            } else
              this.partials.push(base_partial); // put it back
        }

        this.planksNeeded++;
        this.cuts++;

        // Make the length at the bottom of this column
        const cp = new Plank({
          left: l, top: y,
          width: this.PLANK_WIDTH, length: h,
          cut_end: "<"
        });
        y += h;
        col.planks.push(cp);
      
        // Deal with the excess by creating a partial
        const over = this.PLANK_LENGTH - h - this.CUT_THICKNESS;
        //this.waste += this.CUT_THICKNESS;
        if (over > this.MIN_PLANK_LENGTH) {
          // save the rest of the cut plank
          const partial = new Plank({
            left: l, top: y,
            width: this.PLANK_WIDTH, length: over,
            id: cp.id, cut_end: ">"
          });
          this.partials.push(partial);
          //console.debug(`\t+1 cut to ${h}, ${over.toFixed(1)}cm left over`);
        } else {
          // waste the rest of the cut plank
          //console.debug(`\t+1 cut to ${h}, ${over}cm wasted`);
          //this.waste += over;
        }
      }
    
      l += this.PLANK_WIDTH;
      pickPartial = true;
    }

    //for (const plank of this.partials)
    //  this.waste += plank.length;
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
    for (let i = 0; i < this.columns.length; i++) {
      if (this.START_TOP !== 0 && i === 0)
        // Don't move col[0] if START_TOP is non-zero
        continue;
      const col = this.columns[i];
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
   * of objects, each being object.<"<":string,">":string>, where "<"
   * indicates the cut end is the bottom end of the plank and ">" is
   * the top end. Only one will ever be defined.
   * @return {object[]} cutting schedule
   */
  cuttingSchedule() {
    const cuts = [];
    for (const col of this.columns) {
      for (const plank of col.planks) {
        if (plank.cut_end != "") {
          if (!cuts[plank.id])
            cuts[plank.id] = {};
          let cut;
          if (plank.cut_end == "<")
            cut = `${plank.id}< ${plank.length.toFixed(1)}`;
          else
            cut = `${plank.length.toFixed(1)} ${plank.id}>`;
          cuts[plank.id][plank.cut_end] = cut;
        }
      }
    }
    return cuts;
  }

  /**
   * Redraw the room
   * @param {Surface} surf drawing context
   */
  draw(surf) {
    surf.clear();

    if (this.vertices.length < 3)
      // Need at least 3 vertices to make a rectilinear room.
      return;

    // Draw the floor plan
    surf.drawPolygon(this.vertices)
    .fill("none")
    .stroke("rgba(255,165,0,50)");

    for (const col of this.columns)
      col.draw(surf);
   
    // Dump the cutting schedule
    const sched = this.cuttingSchedule()
          .filter(cut => typeof cut !== "undefined")
          .map(cut => `${cut["<"]} | ${cut[">"]}`);
    $("#schedule").html(sched.join("<br>"));

    // Add computed fields
    $("#planksNeeded").text(this.planksNeeded);
    $("#cuts").text(this.cuts);
    $("#waste").text(this.waste.toFixed(1));

    // Display partials
    $("#partials").empty();

    function showPartial(plank, room) {
      const $html = plank.html();
      $html.find("button").on("click", function() {
        const uid = $(this).data("uid");
        room.removePartial(uid);
        $(`[data-uid=${uid}]`).parent().remove();
        if ($("#partials").children().length < 2)
          $("#clear_partials").hide();
      });
      $("#partials").append($html);
    }

    for (const plank of this.partials)
      showPartial(plank, this);

    for (const col of this.columns)
      for (const plank of col.planks)
        if (plank.permanent)
          showPartial(plank, this);

    if ($("#partials").children().length < 2)
      $("#clear_partials").hide();
    else
      $("#clear_partials").show();
  }
}

const url_params = {};
window.location.href.replace(
  /[?&]+([^=&]+)=([^&]*)/gi,
  (m, key, value) => url_params[key] = value);

let room;
const $room_file = $("#room_file");
const surf = new Surface($("#svg"));

/**
 * Load a room from an object of room data built from JSON
 * @param {object} data room data, as dumped by JSON.stringify(Room)
 */
function loadRoom(data) {
  room = new Room(data);
  surf.resize(
    room.leftmost, room.topmost,
    room.rightmost - room.leftmost, room.bottommost - room.topmost,
    room.PLANK_WIDTH);
  room.draw(surf);
}

/**
 * Load a room from a URL containing JSON
 * @param {string} url to get
 */
function getRoom(url) {
  console.log(`Getting ${url}`);
  $.get(url, data => loadRoom(data))
  .catch((res, simple, e) => alert(e.message));
}

/**
 * Load a room from a local file containing JSON
 * @param {File} file the local File to read
 */
function uploadRoom(file) {
  const reader = new FileReader();
  reader.addEventListener('load', e => loadRoom(JSON.parse(e.target.result)));
  reader.readAsText(file);
}

// UI handler: Try the layout again
$("#try_again")
.on("click", () => {
  room.recomputeFloor();
  room.draw(surf);
});

// UI handler: Shuffle columns to avoid staircases
$("#shuffle")
.on("click", () => {
  room.shuffle();
  room.draw(surf);
});

// UI handler: Save the room by downloading a JSON file
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

// UI handler: Save an SVG file
$("#save_svg")
.on("click", () => {
  const blob = surf.blob();
  const url = URL.createObjectURL(blob);
  const a = $("<a></a>");
  a[0].href = url;
  a[0].download = "room.svg";
  $("body").append(a);
  a[0].click();
  $("body").remove(a);
});

// UI handlers: Set up change handlers for the various constraint inputs
for (const key of Object.keys(Room.PARAMS)) {
  $(`#${key}`).on("change", function() {
    console.debug(this.id,this.value);
    room[this.id] = parseFloat(this.value);
    room.recomputeFloor();
    room.draw(surf);
  });
}

// UI handler: Load a new room file
$room_file
.on("change", function () {
  if (this.files[0] == undefined)
    return;
  uploadRoom(this.files[0]);
});

// UI handler: Invoke dialog to add a pre-cut plank
$("#add_partial")
.on("click", () => $("#partial_dialog").dialog());

// UI handler: Submit a new pre-cut plank from the dialog
$("#submit_partial").on("click", () => {
  $("#partial_dialog")
  .dialog("close");
  const partial = new Plank({
    width: room.PLANK_WIDTH,
    length: Number($("#partial_length").val()),
    cut_end: $("#partial_cut_end").val(),
    permanent: true
  });
  room.partials.push(partial);
  room.recomputeFloor();
  room.draw(surf);
});

// UI handler: Clear list of partial planks (including pre-cut)
$("#clear_partials")
.on("click", () => {
  room.clearPartials();
  $("#partials").empty();
  $("#clear_partials").hide();
});

// if ?url= is given, load from url
if (url_params.room)
  getRoom(url_params.room);

// Otherwise if the room file input has a value
else if ($room_file[0].files[0])
  uploadRoom($room_file[0].files[0]);

// Otherwise load a simple example
else
  getRoom("example_room.json");
