// railroad.js (JavaScript version of custom railroad.py)
// This assumes SVG-based rendering. Can be extended for canvas if needed.

// Global variables
let bond_coords = {};
const DEBUG = false;
const VS = 12;
const AR = 10;
const DIAGRAM_CLASS = "railroad-diagram";
const STROKE_ODD_PIXEL_LENGTH = true;
const INTERNAL_ALIGNMENT = "center";  // Options: left, right, center
const CHAR_WIDTH = 8.5;
const COMMENT_CHAR_WIDTH = 7;
const ESCAPE_HTML = true;


function escapeAttr(val) {
    if (typeof val === "string") {
        return val
            .replace(/&/g, "&amp;")
            .replace(/'/g, "&apos;")
            .replace(/"/g, "&quot;");
    }
    return Number(val).toString();
}

function escapeHtml(val) {
    return escapeAttr(val).replace(/</g, "&lt;");
}

function determineGaps(outer, inner) {
    const diff = outer - inner;
    if (INTERNAL_ALIGNMENT === "left") return [0, diff];
    if (INTERNAL_ALIGNMENT === "right") return [diff, 0];
    return [diff / 2, diff / 2];
}

function* doubleenumerate(seq) {
    const length = seq.length;
    for (let i = 0; i < length; i++) {
        yield [i, i - length, seq[i]];
    }
}

function addDebug(el) {
    if (!DEBUG) return;
    el.attrs = el.attrs || {};
    el.attrs["data-x"] = `${el.constructor.name} w:${el.width} h:${el.up}/${el.height}/${el.down}`;
}

export class DiagramItem {
    constructor(name, attrs = {}, text = null) {
        this.name = name;

        // Geometry
        this.up = 0;      // Distance above entry line
        this.height = 0;  // Distance between entry/exit lines
        this.down = 0;    // Distance below exit line
        this.width = 0;   // Horizontal extent
        this.needsSpace = false;

        // SVG attributes
        this.attrs = attrs || {};

        // Children nodes (text or DiagramItem/Path/Style)
        this.children = text !== null ? [text] : [];
    }

    // Abstract: should be overridden in subclasses
    format(x, y, width) {
        throw new Error("format() must be implemented by subclass");
    }

    // Abstract: placeholder for text diagram conversion
    textDiagram() {
        throw new Error("textDiagram() must be implemented by subclass");
    }

    addTo(parent) {
        parent.children.push(this);
        return this;
    }

    writeSvg(write) {
        write(`<${this.name}`);
        const sortedAttrs = Object.entries(this.attrs).sort(([a], [b]) => a.localeCompare(b));
        for (const [key, value] of sortedAttrs) {
            write(` ${key}="${escapeAttr(value)}"`);
        }
        write(">");

        if (this.name === "g" || this.name === "svg") {
            write("\n");
        }

        for (const child of this.children) {
            if (child instanceof DiagramItem || child instanceof Path || child instanceof Style) {
                child.writeSvg(write);
            } else {
                write(escapeHtml(child));
            }
        }

        write(`</${this.name}>`);
    }

    walk(cb) {
        cb(this);
    }

    toString() {
        return `DiagramItem(${this.name}, ${JSON.stringify(this.attrs)}, ${JSON.stringify(this.children)})`;
    }
}

export class DiagramMultiContainer extends DiagramItem {
    constructor(name, items, attrs = {}, text = null) {
        super(name, attrs, text);
        this.items = items.map(item => wrapString(item));  // Ensure all items are DiagramItems
    }

    format(x, y, width) {
        throw new Error("format() must be implemented by subclass");
    }

    walk(cb) {
        cb(this);
        for (const item of this.items) {
            item.walk(cb);
        }
    }

    toString() {
        return `DiagramMultiContainer(${this.name}, ${JSON.stringify(this.items)}, ${JSON.stringify(this.attrs)}, ${JSON.stringify(this.children)})`;
    }
}


export class Path {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.attrs = { d: `M${x} ${y}` };
    }

    m(x, y) {
        this.attrs.d += `m${x} ${y}`;
        return this;
    }

    l(x, y) {
        this.attrs.d += `l${x} ${y}`;
        return this;
    }

    h(val) {
        this.attrs.d += `h${val}`;
        return this;
    }

    right(val) {
        return this.h(Math.max(0, val));
    }

    left(val) {
        return this.h(-Math.max(0, val));
    }

    v(val) {
        this.attrs.d += `v${val}`;
        return this;
    }

    down(val) {
        return this.v(Math.max(0, val));
    }

    up(val) {
        return this.v(-Math.max(0, val));
    }

    arc_8(start, dir) {
        const arc = AR;
        const s2 = (1 / Math.sqrt(2)) * arc;
        const s2inv = arc - s2;
        const sweep = dir === "cw" ? "1" : "0";
        let path = `a ${arc} ${arc} 0 0 ${sweep} `;

        const sd = start + dir;
        let offset;
        switch (sd) {
            case "ncw": offset = [s2, s2inv]; break;
            case "necw": offset = [s2inv, s2]; break;
            case "ecw": offset = [-s2inv, s2]; break;
            case "secw": offset = [-s2, s2inv]; break;
            case "scw": offset = [-s2, -s2inv]; break;
            case "swcw": offset = [-s2inv, -s2]; break;
            case "wcw": offset = [s2inv, -s2]; break;
            case "nwcw": offset = [s2, -s2inv]; break;
            case "nccw": offset = [-s2, s2inv]; break;
            case "nwccw": offset = [-s2inv, s2]; break;
            case "wccw": offset = [s2inv, s2]; break;
            case "swccw": offset = [s2, s2inv]; break;
            case "sccw": offset = [s2, -s2inv]; break;
            case "seccw": offset = [s2inv, -s2]; break;
            case "eccw": offset = [-s2inv, -s2]; break;
            case "neccw": offset = [-s2, -s2inv]; break;
            default: offset = [0, 0]; break;
        }

        path += offset.map(x => x.toFixed(5)).join(" ");
        this.attrs.d += path;
        return this;
    }

    arc(sweep) {
        let x = AR;
        let y = AR;
        if (sweep[0] === "e" || sweep[1] === "w") x *= -1;
        if (sweep[0] === "s" || sweep[1] === "n") y *= -1;

        const cw = ["ne", "es", "sw", "wn"].includes(sweep) ? 1 : 0;
        this.attrs.d += `a${AR} ${AR} 0 0 ${cw} ${x} ${y}`;
        return this;
    }

    addTo(parent) {
        parent.children.push(this);
        return this;
    }

    writeSvg(write) {
        write("<path");
        for (const [name, value] of Object.entries(this.attrs).sort()) {
            write(` ${name}="${escapeAttr(value)}"`);
        }
        write(" />");
    }

    format() {
        this.attrs.d += "h.5";
        return this;
    }

    textDiagram() {
        return new TextDiagram(0, 0, []);
    }

    toString() {
        return `Path(${JSON.stringify(this.x)}, ${JSON.stringify(this.y)})`;
    }
}

export function wrapString(value) {
    return value instanceof DiagramItem ? value : new Terminal(value);
}


export const DEFAULT_STYLE = `
svg.railroad-diagram {
    background-color: hsl(0, 100%, 100%);
}
svg.railroad-diagram path {
    stroke-width: 3;
    stroke: black;
    fill: rgba(0, 0, 0, 0);
}
svg.railroad-diagram text {
    font: bold 14px monospace;
    text-anchor: middle;
}
svg.railroad-diagram text.label {
    text-anchor: start;
}
svg.railroad-diagram text.comment {
    font: bold 16px monospace;
}
svg.railroad-diagram rect {
    stroke-width: 3;
    stroke: black;
    fill: hsl(120, 100%, 90%);
}
svg.railroad-diagram rect.group-box {
    stroke: gray;
    stroke-dasharray: 10 5;
    fill: none;
}

.red { fill: red; }
.green { fill: green; }
.yellow { fill: yellow; }
.blue { fill: blue; }
.lightblue { fill: lightblue; }
.skyblue { fill: skyblue; }
.lightgreen { fill: lightgreen; }
.orange { fill: orange; }
.pink { fill: pink; }
.violet { fill: violet; }
.coral { fill: coral; }
.lightsalmon { fill: lightsalmon; }
.plum { fill: plum; }
.turquoise { fill: turquoise; }

.railroad-diagram .up-triangle polygon,
.railroad-diagram .down-triangle polygon,
.railroad-diagram .diamond polygon {
    stroke-width: 3;
    stroke: black;
    fill: white;
}

svg.railroad-diagram path.right-bind,
svg.railroad-diagram g.terminal path.right-bind,
svg.railroad-diagram g.nonterminal path.right-bind {
    stroke: black;
    stroke-width: 3;
    fill: rgba(0, 0, 0, 0);
}
`;


export class Style {
    constructor(css) {
        this.css = css;
    }

    toString() {
        return `Style(${JSON.stringify(this.css)})`;
    }

    addTo(parent) {
        parent.children.push(this);
        return this;
    }

    format() {
        return this;
    }

    textDiagram() {
        return new TextDiagram(0, 0, []);
    }

    writeSvg(write) {
        // Write included stylesheet as CDATA
        const cdata = `/* <![CDATA[ */\n${this.css}\n/* ]]> */\n`;
        write(`<style>${cdata}</style>`);
    }
}

export class Diagram extends DiagramMultiContainer {
    constructor(...items) {
        super("svg", items, { class: DIAGRAM_CLASS });

        this.type = "simple";
        if (items.length > 0 && !(items[0] instanceof Start)) {
            this.items.unshift(new Start(this.type));
        }
        if (items.length > 0 && !(items[items.length - 1] instanceof End)) {
            this.items.push(new End(this.type));
        }

        this.up = 0;
        this.down = 0;
        this.height = 0;
        this.width = 0;

        for (const item of this.items) {
            if (item instanceof Style) continue;
            this.width += item.width + (item.needsSpace ? 40 : 0);
            this.up = Math.max(this.up, item.up - this.height);
            this.height += item.height;
            this.down = Math.max(this.down - item.height, item.down);
        }

        if (this.items[0].needsSpace) this.width -= 20;
        if (this.items[this.items.length - 1].needsSpace) this.width -= 20;

        this.formatted = false;
    }

    toString() {
        const items = this.items.slice(1, -1).map(i => i.toString()).join(', ');
        const pieces = items ? [items] : [];
        if (this.type !== "simple") {
            pieces.push(`type="${this.type}"`);
        }
        return `Diagram(${pieces.join(", ")})`;
    }

    format(paddingTop = 20, paddingRight = null, paddingBottom = null, paddingLeft = null) {
        if (paddingRight === null) paddingRight = paddingTop;
        if (paddingBottom === null) paddingBottom = paddingTop;
        if (paddingLeft === null) paddingLeft = paddingRight;

        let x = paddingLeft;
        let y = paddingTop + this.up;
        bond_coords = {};
        const g = new DiagramItem("g");
        if (STROKE_ODD_PIXEL_LENGTH) {
            g.attrs["transform"] = "translate(.5 .5)";
        }

        for (const item of this.items) {
            if (item.needsSpace) {
                new Path(x, y).h(20).addTo(g);
                x += 20;
            }
            item.x = x;
            item.format(x, y, item.width).addTo(g);
            x += item.width;
            y += item.height;
            if (item.needsSpace) {
                new Path(x, y).h(20).addTo(g);
                x += 20;
            }
            item.y = y;
        }

        this.attrs["width"] = (this.width + paddingLeft + paddingRight).toString();
        this.attrs["height"] = (this.up + this.height + this.down + paddingTop + paddingBottom * 8).toString();
        this.attrs["viewBox"] = `0 0 ${this.attrs["width"]} ${this.attrs["height"]}`;

        let i = 0;
        let maxBondY = this.up + this.height + paddingTop;
        for (const coords of Object.values(bond_coords)) {
            if (coords.length >= 2) {
                const [[x1, y1], [x2, y2]] = coords;

                let maxStackHeight = 0;
                for (const item of this.items) {
                    if (!(item instanceof DiagramItem)) continue;

                    const itemEndY = item.total_height ?? item.height ?? 0;
                    maxStackHeight =  Math.max(maxStackHeight, itemEndY);
                    
                }

                const offset = Math.min(Math.max(Math.abs(y2 - y1), i * 10), i * 8)+AR*2;
                const vert = maxStackHeight/1.5 + offset + i * 25;
                const bottom_y = y1 + vert;
                const dist_up = bottom_y - y2;
                new Path(x1, y1).down(vert).right(x2 - x1).up(dist_up).addTo(g).attrs["style"] = "stroke: black";

                maxBondY = Math.max(maxBondY, bottom_y);
            }
            i++;
        }
        this.attrs["height"] = (this.up + this.height + this.down + paddingTop + paddingBottom +maxBondY).toString();
        this.attrs["viewBox"] = `0 0 ${this.attrs["width"]} ${this.attrs["height"]}`;

        bond_coords.clear?.(); // Safe clear
        g.addTo(this);
        this.formatted = true;
        return this;
    }

    textDiagram() {
        const [separator] = TextDiagram._getParts(["separator"]);
        let diagramTD = this.items[0].textDiagram();
        for (const item of this.items.slice(1)) {
            let itemTD = item.textDiagram();
            if (item.needsSpace) itemTD = itemTD.expand(1, 1, 0, 0);
            diagramTD = diagramTD.appendRight(itemTD, separator);
        }
        return diagramTD;
    }

    writeSvg(write) {
        if (!this.formatted) this.format();
        return super.writeSvg(write);
    }

    writeText(write) {
        let output = this.textDiagram();
        output = output.lines.join("\n") + "\n";
        if (ESCAPE_HTML) {
            output = output
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;");
        }
        write(output);
    }

    writeStandalone(write, css = null) {
        if (!this.formatted) this.format();
        if (css === null) css = DEFAULT_STYLE;
        new Style(css).addTo(this);
        this.attrs["xmlns"] = "http://www.w3.org/2000/svg";
        this.attrs["xmlns:xlink"] = "http://www.w3.org/1999/xlink";
        super.writeSvg(write);
        this.children.pop();
        delete this.attrs["xmlns"];
        delete this.attrs["xmlns:xlink"];
    }
}


export class Sequence extends DiagramMultiContainer {
    constructor(...items) {
        super("g", items);
        this.needsSpace = true;
        this.up = 0;
        this.down = 0;
        this.height = 0;
        this.width = 0;

        for (const item of this.items) {
            this.width += item.width + (item.needsSpace ? 40 : 0);
            this.up = Math.max(this.up, item.up - this.height);
            this.height += item.height;
            this.down = Math.max(this.down - item.height, item.down);
        }

        if (this.items[0]?.needsSpace) {
            this.width -= 20;
        }
        if (this.items[this.items.length - 1]?.needsSpace) {
            this.width -= 20;
        }

        addDebug(this);
    }

    toString() {
        return `Sequence(${this.items.map(item => item.toString()).join(", ")})`;
    }

    format(x, y, width) {
        this.formatted_y = y;
        const [leftGap, rightGap] = determineGaps(width, this.width);
        new Path(x, y).h(leftGap).addTo(this);
        new Path(x + leftGap + this.width, y + this.height).h(rightGap).addTo(this);
        x += leftGap;

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.needsSpace && i > 0) {
                new Path(x, y).h(20).addTo(this);
                x += 20;
            }
            item.format(x, y, item.width).addTo(this);
            x += item.width;
            y += item.height;
            if (item.needsSpace && i < this.items.length - 1) {
                new Path(x, y).h(20).addTo(this);
                x += 20;
            }
        }

        let totalHeight = 0;
        for (const item of this.items) {
            totalHeight += item.total_height ?? item.height ?? 0;

        }
        this.total_height = totalHeight;

        return this;
    }

    textDiagram() {
        const [separator] = TextDiagram._getParts(["separator"]);
        let diagramTD = new TextDiagram(0, 0, [""]);
        for (const item of this.items) {
            let itemTD = item.textDiagram();
            if (item.needsSpace) {
                itemTD = itemTD.expand(1, 1, 0, 0);
            }
            diagramTD = diagramTD.appendRight(itemTD, separator);
        }
        return diagramTD;
    }
}

export class Choice extends DiagramMultiContainer {
    constructor(defaultIndex, ...items) {
        super("g", items);
        if (defaultIndex >= items.length) throw new Error("Invalid default index");
        this.items = items;
        this.default = defaultIndex;
        this.right_bind = false;
        this.right_bind_color = 'black';
        this.bond_num = null;
        this.separators = Array(items.length - 1).fill(VS);
        this.width = AR * 4 + Math.max(...this.items.map(item => item.width));

        this.up = 0;
        for (let i = defaultIndex - 1; i >= 0; i--) {
            const arcs = (i === defaultIndex - 1 ? AR * 2 : AR);
            const item = this.items[i];
            const lowerItem = this.items[i + 1];

            const entryDelta = lowerItem.up + VS + item.down + item.height;
            const exitDelta = lowerItem.height + lowerItem.up + VS + item.down;
            let separator = VS;
            if (exitDelta < arcs || entryDelta < arcs) {
                separator += Math.max(arcs - entryDelta, arcs - exitDelta);
            }
            this.separators[i] = separator;
            this.up += lowerItem.up + separator + item.down + item.height;
        }
        this.up += this.items[0].up;

        this.height = this.items[defaultIndex].height;
        this.down = 0;
        for (let i = defaultIndex + 1; i < this.items.length; i++) {
            const arcs = (i === defaultIndex + 1 ? AR * 2 : AR);
            const item = this.items[i];
            const upperItem = this.items[i - 1];

            const entryDelta = upperItem.height + upperItem.down + VS + item.up;
            const exitDelta = upperItem.down + VS + item.up + item.height;
            let separator = VS;
            if (entryDelta < arcs || exitDelta < arcs) {
                separator += Math.max(arcs - entryDelta, arcs - exitDelta);
            }
            this.separators[i - 1] = separator;
            this.down += upperItem.down + separator + item.up + item.height;
        }
        this.down += this.items[this.items.length - 1].down;
        addDebug(this);
    }

    toString() {
        return `Choice(${this.default}, ${this.items.map(item => item.toString()).join(", ")})`;
    }

    format(x, y, width) {
        this.formatted_y = y;
        const [leftGap, rightGap] = determineGaps(width, this.width);
        new Path(x, y).h(leftGap).addTo(this);
        new Path(x + leftGap + this.width, y + this.height).h(rightGap).addTo(this);
        x += leftGap;

        if (this.right_bind) {
            const path = new Path(x + this.width, y).arc("ne").down(25);
            path.attrs["class"] = "bind";
            path.attrs["style"] = `stroke: ${this.right_bind_color};`;
            path.addTo(this);

            if (this.bond_num) {
                const cx = x + this.width + AR;
                const cy = y + AR + 25;
                const term = new Terminal(this.bond_num, { box_color: "white" });
                term.width *= 0.78;
                term.format(cx - term.width / 2, cy, term.width).addTo(this);
            }
        }

        const innerWidth = this.width - AR * 4;
        const defaultItem = this.items[this.default];

        let distanceFromY = 0;
        for (let i = this.default - 1; i >= 0; i--) {
            const item = this.items[i];
            const lowerItem = this.items[i + 1];
            distanceFromY += lowerItem.up + this.separators[i] + item.down + item.height;
            new Path(x, y).arc("se").up(distanceFromY - AR * 2).arc("wn").addTo(this);
            item.format(x + AR * 2, y - distanceFromY, innerWidth).addTo(this);
            new Path(x + AR * 2 + innerWidth, y - distanceFromY + item.height).arc("ne")
                .down(distanceFromY - item.height + defaultItem.height - AR * 2).arc("ws").addTo(this);
        }


        const straight_line_path1 = new Path(x, y).right(AR * 2).addTo(this);
            straight_line_path1.attrs.style = "stroke: black; stroke-dasharray: 4,2";
        this.items[this.default].format(x + AR * 2, y, innerWidth).addTo(this);
        const straight_line_path2 = new Path(x + AR * 2 + innerWidth, y + this.height).right(AR * 2).addTo(this);
            straight_line_path2.attrs.style = "stroke: black; stroke-dasharray: 4,2";

        distanceFromY = 0;
        for (let i = this.default + 1; i < this.items.length; i++) {
            const item = this.items[i];
            const upperItem = this.items[i - 1];
            distanceFromY += upperItem.height + upperItem.down + this.separators[i - 1] + item.up;
            new Path(x, y).arc("ne").down(distanceFromY - AR * 2).arc("ws").addTo(this);
            item.format(x + AR * 2, y + distanceFromY, innerWidth).addTo(this);
            new Path(x + AR * 2 + innerWidth, y + distanceFromY + item.height).arc("se")
                .up(distanceFromY - AR * 2 + item.height - defaultItem.height).arc("wn").addTo(this);
        }

        let totalHeight = 0;
        for (const item of this.items) {
            totalHeight += item.total_height ?? item.height ?? 0;
        }
        this.total_height = totalHeight;
        return this;
    }

    textDiagram() {
        // Implement as needed if text rendering is required
        return new TextDiagram(0, 0, []);
    }
}

export class MultipleChoice extends DiagramMultiContainer {
    constructor(defaultIndex, type, arrow, ...items) {
        super("g", items);
        if (!(0 <= defaultIndex && defaultIndex < items.length)) throw new Error("Invalid default index");
        if (!["up-arrow", "down-arrow"].includes(type)) throw new Error("Invalid type");
        if (!["->", "<->"].includes(arrow)) throw new Error("Invalid arrow type");
        this.default = defaultIndex;
        this.type = type;
        this.arrow = arrow;
        this.needsSpace = true;
        this.innerWidth = Math.max(...this.items.map(item => item.width));
        this.width = 30 + AR + this.innerWidth + AR + 20;
        this.up = this.items[0].up;
        this.down = this.items[this.items.length - 1].down;
        this.height = this.items[defaultIndex].height;

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const nextItem = this.items[i + 1];
            const prevItem = this.items[i - 1];
            const minSep = (i === defaultIndex - 1 || i === defaultIndex + 1) ? 10 + AR : AR;
            if (i < defaultIndex) {
                this.up += Math.max(minSep, item.height + item.down + VS + (nextItem ? nextItem.up : 0));
            } else if (i > defaultIndex) {
                this.down += Math.max(minSep, item.up + VS + (prevItem ? prevItem.down + prevItem.height : 0));
            }
        }
        this.down -= this.items[defaultIndex].height;
        addDebug(this);
    }

    toString() {
        return `MultipleChoice(${this.default}, ${this.type}, ${this.items.map(item => item.toString()).join(", ")})`;
    }

    format(x, y, width) {
        const [leftGap, rightGap] = determineGaps(width, this.width);
        new Path(x, y).h(leftGap + 10).addTo(this);
        new Path(x + leftGap + this.width, y + this.height).h(rightGap).addTo(this);
        x += leftGap;

        const defaultItem = this.items[this.default];

        const above = this.items.slice(0, this.default).reverse();
        if (above.length) {
            let distanceFromY = Math.max(10 + AR, defaultItem.up + VS + above[0].down + above[0].height);
            for (let i = 0; i < above.length; i++) {
                const item = above[i];
                new Path(x + 30, y).up(distanceFromY - AR).arc("wn").addTo(this);
                item.format(x + 30 + AR, y - distanceFromY, this.innerWidth).addTo(this);
                new Path(x + 30 + AR + this.innerWidth, y - distanceFromY + item.height)
                    .arc("ne").down(distanceFromY - item.height + defaultItem.height - AR - 10).addTo(this);
                const nextItem = above[i + 1];
                if (nextItem) {
                    distanceFromY += Math.max(AR, item.up + VS + nextItem.down + nextItem.height);
                }
            }
        }

        new Path(x + 30, y).right(AR).addTo(this);
        defaultItem.format(x + 30 + AR, y, this.innerWidth).addTo(this);
        new Path(x + 30 + AR + this.innerWidth, y + this.height).right(AR*3).addTo(this); //no box on the right
        //new Path(x + 30 + AR + this.innerWidth, y + this.height).right(AR).addTo(this); // box on the right
        const below = this.items.slice(this.default + 1);
        if (below.length) {
            let distanceFromY = Math.max(10 + AR, defaultItem.height + defaultItem.down + VS + below[0].up);
            for (let i = 0; i < below.length; i++) {
                const item = below[i];
                new Path(x + 30, y).down(distanceFromY - AR).arc("ws").addTo(this);
                item.format(x + 30 + AR, y + distanceFromY, this.innerWidth).addTo(this);
                new Path(x + 30 + AR + this.innerWidth, y + distanceFromY + item.height)
                    .arc("se").up(distanceFromY - AR + item.height - defaultItem.height).addTo(this); //no box on the right
                    //.arc("se").up(distanceFromY - AR + item.height - defaultItem.height-10).addTo(this); // box on the right
                const nextItem = below[i + 1];
                if (nextItem) {
                    distanceFromY += Math.max(AR, item.height + item.down + VS + nextItem.up);
                }
            }
        }

        const textGroup = new DiagramItem("g", { class: "diagram-text" }).addTo(this);

        new DiagramItem(
            "title", {}, 
            this.type === "up-arrow"
                ? "take one or more branches, once each, in any order"
                : "take all branches, once each, in any order"
        ).addTo(textGroup);

        new DiagramItem("path", {
            d: `M ${x + 30} ${y - 10} h -16 a 4 4 0 0 0 -4 4 v 12 a 4 4 0 0 0 4 4 h 16 z`,
            class: "diagram-text",
            style: "fill: orange"
        }).addTo(textGroup);

        new DiagramItem("text", {
            x: x + 20,
            y: y + 6,
            class: "diagram-text"
        }, this.type === "up-arrow" ? "⬆" : "⬇").addTo(textGroup);

        // no box on the right
        if (this.arrow === "<->") {
            new DiagramItem("path", {
                d: `M ${x + this.width - 20} ${y - 10} h 16 a 4 4 0 0 1 4 4 v 12 a 4 4 0 0 1 -4 4 h -16 z`,
                class: "diagram-text",
                style: "fill: orange"
            }).addTo(textGroup);
        }

        /* // create a box on the right
        new DiagramItem("path", {
            d: `M ${x + this.width - 20} ${y - 10} h 16 a 4 4 0 0 1 4 4 v 12 a 4 4 0 0 1 -4 4 h -16 z`,
            class: "diagram-text",
            style: "fill: orange"
        }).addTo(textGroup);
        */

        // no box on the right
        if (this.arrow === "<->") {
            new DiagramItem("text", {
                x: x + this.width - 10,
                y: y + 6,
                class: "diagram-text"
            }, this.type === "up-arrow" ? "⬇" : "⬆").addTo(textGroup);

        } /* // create a box on the right
        else {
            new DiagramItem("text", {
                x: x + this.width - 10,
                y: y + 6,
                class: "diagram-text"
            }, this.type === "up-arrow" ? "⬆" : "⬇").addTo(textGroup);
        } */

        return this;
    }

    textDiagram() {
        return new TextDiagram(0, 0, []);
    }
}


export class Group extends DiagramItem {
  constructor(item, label = null) {
    super("g");
    this.item = wrapString(item);

    if (label instanceof DiagramItem) {
      this.label = label;
    } else if (label) {
      this.label = new Comment(label);
    } else {
      this.label = null;
    }

    this.width = Math.max(
        (this.item.width ?? 0) + (this.item.needsSpace ? 20 : 0),
        this.label ? (this.label.width ?? 0) : 0,
        AR * 2
        );


    this.height = this.item.height;
    this.boxUp = Math.max(this.item.up + VS, AR);
    this.up = this.boxUp;

    if (this.label) {
      this.up += this.label.up + this.label.height + this.label.down;
    }

    this.down = Math.max(this.item.down + VS, AR);
    this.needsSpace = true;

    addDebug(this);
  }

  format(x, y, width) {
    const [leftGap, rightGap] = determineGaps(width, this.width);
    new Path(x, y).h(leftGap).addTo(this);
    new Path(x + leftGap + this.width, y + this.height).h(rightGap).addTo(this);
    x += leftGap;

    let style = "";
    let labelColor = "";
    if (this.label.text === "synthesized") {
        style = `fill: none; stroke: mediumseagreen; stroke-dasharray: 10 5`;
        labelColor = "green";
    } else if (this.label.text === "degraded") {
        style = `fill: none; stroke: indianred; stroke-dasharray: 10 5;`;
        labelColor = "red";
    }

    const rect_attrs = {
      x: x-35,
      y: y - this.boxUp,
      width: this.width +72,
      height: (this.boxUp+15) + this.height + (this.down +40),
      rx: AR,
      ry: AR,
      //style: style,
      class: "group-box"
    };

    new DiagramItem("rect", rect_attrs).addTo(this);

    this.item.format(x, y, this.width).addTo(this);

    if (this.label) {
        const labelElement =  this.label.format(
            x-20,
            y - (this.boxUp + this.label.down + this.label.height+5),
            this.label.width
        );
        labelElement.attrs.fill = labelColor;
        labelElement.addTo(this);
        }

    let totalHeight = 0;
    totalHeight = (this.item.total_height-15) ?? this.item.height ?? 0;
    this.total_height = totalHeight;
    return this;
  }

  textDiagram() {
    let diagramTD = TextDiagram.roundrect(this.item.textDiagram(), true);  // dashed = true
    if (this.label) {
      const labelTD = this.label.textDiagram();
      diagramTD = labelTD
        .appendBelow(diagramTD, [], true, true)
        .expand(0, 0, 1, 0);
    }
    return diagramTD;
  }

  walk(cb) {
    cb(this);
    this.item.walk(cb);
    if (this.label) this.label.walk(cb);
  }

  toString() {
    return `Group(${this.item.toString()}, label=${this.label ? this.label.toString() : "null"})`;
  }
}

export class Start extends DiagramItem {
  constructor(type = "simple", label = null) {
    super("g");
    this.type = type;
    this.label = label;
    this.width = label ? Math.max(20, label.length * CHAR_WIDTH + 10) : 20;
    this.up = 10;
    this.down = 10;
    addDebug(this);
  }

  format(x, y, width) {
    const path = new Path(x+15, y - 10);
    if (this.type === "complex") {
        path.down(20).m(10, -20).down(20).m(-10, -10).right(this.width).addTo(this);
    } else {
        path.down(20).m(0, -10).right(10).addTo(this);
      
    }
    if (this.label) {
      new DiagramItem("text", {
        x: x,
        y: y - 15,
        style: "text-anchor:start"
      }, this.label).addTo(this);
    }
    return this;
  }

  textDiagram() {
    // Implement this method if needed
    return new TextDiagram(0, 0, []);
  }

  toString() {
    return `Start(type=${JSON.stringify(this.type)}, label=${JSON.stringify(this.label)})`;
  }
}

export class End extends DiagramItem {
  constructor(type = "simple") {
    super("path");
    this.type = type;
    this.width = 20;
    this.up = 10;
    this.down = 10;
    addDebug(this);
  }

  format(x, y, width) {
    if (this.type === "simple") {
      this.attrs["d"] = `M ${x} ${y} h 5 m 0 -10 v 20`;
    } else if (this.type === "complex") {
      this.attrs["d"] = `M ${x} ${y} h 20 m -10 -10 v 20 m 10 -20 v 20`;
    }
    return this;
  }

  textDiagram() {
    // Implement this method if needed
    return new TextDiagram(0, 0, []);
  }

  toString() {
    return `End(type=${JSON.stringify(this.type)})`;
  }
}

/*
changeType:
+ to + (NoChangeSeparate): horizontal line color is white
. to . (NoChangeComplex): horizontal line color is gray

+ to . (NonRevChangeComplex): horizontal line color is gray, add green nonterminal with down arrow
. to + (NonRevChangeSeparate): horizontal line color is gray, add red nonterminal with up arrow

Rev:
+ to . (RevChangeComplex): horizontal line color is gray, add green nonterminal with two arrows
. to + (RevChangeSeparate): horizontal line color is gray, add red nonterminal with two arrows



*/

// for separating molecule diagrams
export class EndWhiteSpace extends DiagramItem {
  constructor(changeType = null, type = "simple") {
    super("g");
    this.type = type;
    this.changeType = changeType;
    this.width = 80; // space between two | |
    this.up = 10;
    this.down = 10;
    addDebug(this);
  }

  format(x, y, width) {
    if (this.type === "simple") {
        if (this.changeType) {
            // separator for no changes
            if (this.changeType === "NoChangeComplex" || this.changeType === "NoChangeSeparate") {
                const horiz = new Path(x, y).h(80);
                horiz.attrs.style = `stroke: gray; stroke-dasharray: 4,2`; // . to .
                if (this.changeType === "NoChangeSeparate") {
                    horiz.attrs.style = `stroke: white;`; // + to +
                }
                horiz.addTo(this);
            } else { // separator for reversible and nonreversible changes
                // draws connecting gray line
                const horiz1 = new Path(x, y).h(80);
                    horiz1.attrs.style = `stroke: gray; stroke-dasharray: 4,2`;
                    horiz1.addTo(this);
                // adds arrow depending on the change
                let term = null;
                if (this.changeType === "NonRevChangeComplex") {
                    term = new NonTerminal("⬇", { box_color: "white", line_color: "white" });
                } else if (this.changeType === "NonRevChangeSeparate"){
                    term = new NonTerminal("⬆" , { box_color: "white", line_color: "white" });
                } else if (this.changeType === "RevChangeComplex") {
                    term = new NonTerminal("⬇⬆", { box_color: "white", line_color: "white" });
                } else if (this.changeType === "RevChangeSeparate"){
                    term = new NonTerminal("⬆⬇", { box_color: "white", line_color: "white" });
                }
                term.width *= 0.75;
                term.format(x+32, y, 15).addTo(this);
            }
        } else { // no changes - ex. observables 
            const horiz = new Path(x, y).h(80);
                horiz.attrs.style = `stroke: gray; stroke-dasharray: 4,2`;
                horiz.addTo(this);
        }
      // draws two line | |
      const vert1 = new Path(x, y - 10).v(20).addTo(this);
      const vert2 = new Path(x + 80, y - 10).v(20).addTo(this);

    } else if (this.type === "complex") {
      new Path(x + 20, y - 10).v(20).addTo(this);
    }
    return this;

    /* old separator
    export class EndWhiteSpace extends DiagramItem {
    constructor(type = "simple") {
        super("path");
        this.type = type;
        this.width = 50;
        this.up = 10;
        this.down = 10;
        addDebug(this);
    }
    format(x, y, width) {
    if (this.type === "simple") {
      this.attrs["d"] = `M ${x} ${y - 10} v 20 M ${x + 10} ${y - 10} v 20`;
    } else if (this.type === "complex")
      this.attrs["d"] = `M ${x + 20} ${y - 10} v 20`;
    }
    */
  }

  textDiagram() {
    const bar = "│";
    const space = "  ";
    const end = this.type === "simple" ? bar + space + bar : bar;
    return new TextDiagram(0, 0, [end]);
  }

  toString() {
    return `End(type=${JSON.stringify(this.type)})`;
  }
}

export class Terminal extends DiagramItem {
    constructor(text, {
        href = null,
        title = null,
        cls = "",
        box_color = null,
        line_color = null,
        text_color = null,
        right_bind = false,
        bottom_bind = false,
        top_bind = false,
        right_bind_color = "black",
        bottom_bind_color = "black",
        top_bind_color = "black",
        bond_num = null,
        show_bond = false,
        bond_type = "circle",
        wrap = false
    } = {}) {
        super("g", { class: ["terminal", cls].join(" ") });
        this.text = text;
        this.href = href;
        this.title = title;
        this.cls = cls;
        this.box_color = box_color;
        this.line_color = line_color;
        this.text_color = text_color;

        this.right_bind = right_bind;
        this.right_bind_color = right_bind_color;

        this.bottom_bind = bottom_bind;
        this.bottom_bind_color = bottom_bind_color;

        this.top_bind = top_bind;
        this.top_bind_color = top_bind_color;

        this.bond_num = bond_num;
        this.show_bond = show_bond;
        this.bond_type = bond_type;
        this.wrap = wrap;

        this.width = text.length * CHAR_WIDTH + 20;
        this.up = 11;
        this.down = 11;
        this.needsSpace = true;
        addDebug(this);
    }

    toString() {
        return `Terminal(${JSON.stringify(this.text)}, href=${JSON.stringify(this.href)}, title=${JSON.stringify(this.title)}, cls=${JSON.stringify(this.cls)})`;
    }

    format(x, y, width) {
        this.formatted_x = x;
        this.formatted_y = y;
        this.formatted_width = width;
        const [leftGap, rightGap] = determineGaps(width, this.width);

        const straight_path1 = new Path(x, y).h(leftGap).addTo(this);
            straight_path1.attrs.style = "stroke: black; stroke-dasharray: 4,2";
        const straight_path2 = new Path(x + leftGap + this.width, y).h(rightGap).addTo(this);
            straight_path2.attrs.style = "stroke: black; stroke-dasharray: 4,2";

        if (this.right_bind) {
            const path = new Path(x + this.width, y).arc("ne").down(25);
            path.attrs.class = "right-bind";
            path.attrs.style = `stroke: ${this.right_bind_color}`;
            path.addTo(this);

            if (this.bond_num) {
                const cx = x + this.width + AR;
                const cy = y + AR + 25;
                const term = new Terminal(this.bond_num, { box_color: "white" });
                term.width *= 0.78;
                term.format(cx - term.width / 2, cy, term.width).addTo(this);
            }
        }

        if (this.bottom_bind) {
            if (this.wrap) {
                const arc_start = x - this.width;
                const arc_height = AR * 1.5;
                const path = new Path(arc_start, y - AR / 2)
                    .down(arc_height).arc("ws").right(this.width / 4).arc("ne").arc("wn")
                    .right(this.width / 4).arc("se").up(arc_height);
                path.attrs.class = "bottom-bind";
                path.attrs.style = "stroke: gray;";
                path.addTo(this);
            } else {
                const horiz_dist = width / 2 - AR;
                const path1 = new Path(x, y + this.height)
                    .arc("nw").arc("ws").right(horiz_dist).arc("ne").down(this.height);
                const style = `stroke: ${this.bottom_bind_color}`;
                path1.attrs.class = "bottom-bind";
                path1.attrs.style = style;
                path1.addTo(this);

                const path2 = new Path(x + width, y + this.height)
                    .arc("ne").arc("es").left(horiz_dist).arc("nw").down(this.height);
                path2.attrs.class = "bottom-bind";
                path2.attrs.style = style;
                path2.addTo(this);

                if (this.bond_num && this.bond_num !== "+") {
                    let cx = x + this.width / 2;
                    let cy = y + this.height + AR * 4;
                    let up, down, up_height;

                    if (this.bond_type === "circle") {
                        
                        if (this.show_bond || this.bond_num === "?" ) {
                        let term = new NonTerminal(this.bond_num, { box_color: "white" });
                        if (this.bond_num === "?") {
                            term = new NonTerminal(this.bond_num, { box_color: "white", line_color: "white", text_color: "gray" });
                        }
                        term.width *= 0.78;
                        term.format(cx - term.width / 2, cy, term.width).addTo(this);
                        cy += term.height / 2 + term.down;
                        } else {
                            cy -= 15;
                        }
                    } else {
                        cx = x + width / 2;
                        cy = y + this.height + AR * 5;
                        const arrow = {
                            nrbroken: "⬆",
                            nradded: "⬇",
                            radded: "⬇⬆",
                            rbroken: "⬆⬇"
                        }[this.bond_type];

                        if (arrow) {
                            const up = new NonTerminal(this.bond_num, { box_color: "white" });
                            const up_height = up.up + up.down - 2;
                            
                            let arrow_color = null;
                            if (this.bond_type === "nrbroken" || this.bond_type === "rbroken") {
                               arrow_color = "red";
                            }
                            if (this.bond_type === "nradded" || this.bond_type === "radded") {
                               arrow_color = "limegreen";
                            }

                            const down = new NonTerminal(arrow, { box_color: arrow_color });
                            if (this.bond_type === "nrbroken" || this.bond_type === "nradded") {
                                down.width *= 0.75;
                                up.width *= 0.75;
                            }
                            else if (this.bond_type === "rbroken" || this.bond_type === "radded") {
                                down.width *= 0.78;
                            }

                            if (this.show_bond) {
                                up.format(cx - up.width / 2, cy - up_height + up.up, up.width).addTo(this);
                                down.format(cx - down.width / 2, cy + up_height / 2, down.width).addTo(this);
                            } else {
                                down.format(cx - up.width / 2, cy - up_height + up.up, up.width).addTo(this);
                            }

                            if (down.formatted_y !== undefined) {
                                cy = down.formatted_y + down.height / 2 + down.down;
                            }
                        }
                    }

                    if (typeof bond_coords !== "undefined") {
                        if (this.bond_num !== "?") {
                        bond_coords[this.bond_num] = bond_coords[this.bond_num] || [];
                        bond_coords[this.bond_num].push([cx, cy]);
                        }
                    }
                }
            }
        }

        if (this.top_bind) {
            const horiz_dist = this.width / 2 - AR;
            const path1 = new Path(x, y - this.height).arc("sw").arc("wn").right(horiz_dist).arc("se").up(this.height);
            path1.attrs.class = "top-bind";
            path1.attrs.style = `stroke: ${this.top_bind_color}; fill: none`;
            path1.addTo(this);

            const path2 = new Path(x + this.width, y - this.height).arc("se").arc("en").left(horiz_dist).arc("sw").up(this.height);
            path2.attrs.class = "top-bind";
            path2.attrs.style = `stroke: ${this.top_bind_color}; fill: none`;
            path2.addTo(this);
        }

        const rect_attrs = {
            x: x + leftGap,
            y: y - 11,
            width: this.width,
            height: this.up + this.down,
            rx: AR,
            ry: AR
        };

        if (this.box_color !== null) {
            rect_attrs.style = `fill: ${this.box_color}`;
        }

        new DiagramItem("rect", rect_attrs).addTo(this);

        const textElem = new DiagramItem("text", {
            x: x + leftGap + this.width / 2,
            y: y + 4
        }, this.text);

        if (this.href !== null) {
            const a = new DiagramItem("a", { "xlink:href": this.href }, textElem).addTo(this);
            textElem.addTo(a);
        } else {
            textElem.addTo(this);
        }

        if (this.title !== null) {
            new DiagramItem("title", {}, this.title).addTo(this);
        }
        this.total_height = this.up+this.down;

        return this;
    }

    textDiagram() {
        return TextDiagram.roundrect(this.text);
    }
}


export class NonTerminal extends DiagramItem {
    constructor(text, {
        href = null,
        title = null,
        cls = "",
        box_color = null,
        line_color = null,
        text_color = null,
        right_bind = false,
        bottom_bind = false,
        top_bind = false,
        right_bind_color = "black",
        bottom_bind_color = "black",
        top_bind_color = "black",
        bond_num = null,
        show_bond = false,
        bond_type = "circle",
        wrap = false,
        state_and_bond_wrap = false
    } = {}) {
        super("g", { class: ["non-terminal", cls].join(" ") });
        this.text = text;
        this.href = href;
        this.title = title;
        this.cls = cls;
        this.box_color = box_color;
        this.text_color = text_color;
        this.line_color = line_color;

        this.right_bind = right_bind;
        this.right_bind_color = right_bind_color;

        this.bottom_bind = bottom_bind;
        this.bottom_bind_color = bottom_bind_color;

        this.top_bind = top_bind;
        this.top_bind_color = top_bind_color;

        this.bond_num = bond_num;
        this.show_bond = show_bond;
        this.bond_type = bond_type;
        this.wrap = wrap;
        this.state_and_bond_wrap = state_and_bond_wrap;

        this.width = text.length * CHAR_WIDTH + 20;
        this.up = 11;
        this.down = 11;
        this.needsSpace = true;
        addDebug(this);
    }

    toString() {
        return `NonTerminal(${JSON.stringify(this.text)}, href=${JSON.stringify(this.href)}, title=${JSON.stringify(this.title)}, cls=${JSON.stringify(this.cls)})`;
    }

    format(x, y, width) {
        this.formatted_x = x;
        this.formatted_y = y;
        this.formatted_width = width;
        const [leftGap, rightGap] = determineGaps(width, this.width);

        new Path(x, y).h(leftGap).addTo(this);
        new Path(x + leftGap + this.width, y).h(rightGap).addTo(this);

        if (this.right_bind) {
            const path = new Path(x + this.width, y).arc("ne").down(25);
            path.attrs.class = "right-bind";
            path.attrs.style = `stroke: ${this.right_bind_color}`;
            path.addTo(this);

            if (this.bond_num) {
                const cx = x + this.width + AR;
                const cy = y + AR + 25;
                const term = new Terminal(this.bond_num, { box_color: "white" });
                term.width *= 0.78;
                term.format(cx - term.width / 2, cy, term.width).addTo(this);
            }
        }

        if (this.bottom_bind) {
            if (this.wrap) {
                const arc_start = x - AR;
                const arc_height = AR * 1.5;
                const path1 = new Path(arc_start, y - AR / 2)
                    .down(arc_height).arc("ws").right(width / 2 - AR).arc("ne");
                path1.attrs.class = "bottom-bind";
                path1.attrs.style = "stroke: gray";
                path1.addTo(this);

                const path2 = new Path(x + AR + width, y - AR / 2)
                    .down(arc_height).arc("es").left(width / 2 - AR).arc("nw");
                path2.attrs.class = "bottom-bind";
                path2.attrs.style = "stroke: gray";
                path2.addTo(this);
            }
            else {
                if (this.state_and_bond_wrap) {
                const arc_start = x - AR;
                const arc_height = AR * 1.5;

                const isUnknownBond = this.bond_num === "?";
                const strokeStyle = isUnknownBond ? "stroke: gray; stroke-dasharray: 4,2" : "stroke: black";

                if (isUnknownBond) {
                    const horiz_dist = width / 2 - AR;
                    const path1 = new Path(x, y + VS*3)
                        .arc("nw").arc("ws").right(horiz_dist).arc("ne").down(this.height);

                    const style = `stroke: ${this.bottom_bind_color}`

                    path1.attrs.class = "bottom-bind";
                    path1.attrs.style = style;
                    path1.addTo(this);

                    const path2 = new Path(x + width, y + VS*3)
                        .arc("ne").arc("es").left(horiz_dist).arc("nw").down(this.height);
                    path2.attrs.class = "bottom-bind";
                    path2.attrs.style = style;
                    path2.addTo(this);
                    this._bond_arc_bottom_y = y - AR /2 + arc_height * 4 + AR * 2;
                } else {

                const horiz_dist = width / 2 - AR;
                const path1 = new Path(x, y + this.height+VS*3)
                    .arc("nw").arc("ws").right(horiz_dist).arc("ne").down(this.height);

                const style = `stroke: ${this.bottom_bind_color}`

                path1.attrs.class = "bottom-bind";
                path1.attrs.style = style;
                path1.addTo(this);

                const path2 = new Path(x + width, y + this.height+VS*3)
                    .arc("ne").arc("es").left(horiz_dist).arc("nw").down(this.height);
                if (this.bond_num !== "+") {
                    path2.down(15);
                }
                path2.attrs.class = "bottom-bind";
                path2.attrs.style = style;
                path2.addTo(this);
                this._bond_arc_bottom_y = y - AR /2 + arc_height * 4 + AR * 3;
                }}
                else {
                const horiz_dist = width / 2 - AR;
                const path1 = new Path(x, y + this.height)
                    .arc("nw").arc("ws").right(horiz_dist).arc("ne").down(this.height);

                const style = `stroke: ${this.bottom_bind_color}`

                path1.attrs.class = "bottom-bind";
                path1.attrs.style = style;
                path1.addTo(this);

                const path2 = new Path(x + width, y + this.height)
                    .arc("ne").arc("es").left(horiz_dist).arc("nw").down(this.height);
                path2.attrs.class = "bottom-bind";
                path2.attrs.style = style;
                path2.addTo(this);
                }

                if (this.bond_num && this.bond_num !== "+") {
                    let cx = 0, cy = 0;
                    if (this.bond_type === "circle") {
                        cx = x + width / 2;
                        cy = (this._bond_arc_bottom_y+8) || (y + this.height + AR * 4);

                        if (this.show_bond || this.bond_num === "?" ) {
                        let term = new NonTerminal(this.bond_num, { box_color: "white" });

                        if (this.bond_num === "?") {
                            term = new NonTerminal(this.bond_num, { box_color: "white", line_color: "white", text_color: "gray" });
                        }
                        term.width *= 0.78;
                        term.format(cx - term.width / 2, cy, term.width).addTo(this);
                        cy += term.height / 2 + term.down;
                        } else {
                            cy -= 15;
                        }
                    } else {
                        cx = x + width / 2;
                        cy = this._bond_arc_bottom_y || (y + this.height + AR * 5);
                        const arrow = {
                            nrbroken: "⬆",
                            nradded: "⬇",
                            radded: "⬇⬆",
                            rbroken: "⬆⬇"
                        }[this.bond_type];

                        if (arrow) {
                            const up = new NonTerminal(this.bond_num, { box_color: "white" });
                            const up_height = up.up + up.down - 2;
                    
                            let arrow_color = null;
                            if (this.bond_type === "nrbroken" || this.bond_type === "rbroken") {
                               arrow_color = "red";
                            }
                            if (this.bond_type === "nradded" || this.bond_type === "radded") {
                               arrow_color = "limegreen";
                            }

                            const down = new NonTerminal(arrow, { box_color: arrow_color });
                            if (this.bond_type === "nrbroken" || this.bond_type === "nradded") {
                                down.width *= 0.75;
                                up.width *= 0.75;
                            }
                            else if (this.bond_type === "rbroken" || this.bond_type === "radded") {
                                down.width *= 0.78;
                            }

                            if (this.show_bond) {
                                up.format(cx - up.width / 2, cy - up_height + up.up, up.width).addTo(this);
                                down.format(cx - down.width / 2, cy + up_height / 2, down.width).addTo(this);
                            } else {
                                down.format(cx - up.width / 2, cy - up_height + up.up, up.width).addTo(this);

                            }

                            if (down.formatted_y !== undefined) {
                                cy = down.formatted_y + down.height / 2 + down.down;
                            }
                        }
                    }

                    if (typeof bond_coords !== "undefined") {
                        if (this.bond_num !== "?") {
                        bond_coords[this.bond_num] = bond_coords[this.bond_num] || [];
                        bond_coords[this.bond_num].push([cx, cy]);
                        }
                    }
                }
            }
        }

        if (this.top_bind) {
            const horiz_dist = this.width / 2 - AR;
            const path1 = new Path(x, y - this.height)
                .arc("sw").arc("wn").right(horiz_dist).arc("se").up(this.height);
            path1.attrs.class = "top-bind";
            path1.attrs.style = `stroke: ${this.top_bind_color}`;
            path1.addTo(this);

            const path2 = new Path(x + this.width, y - this.height)
                .arc("se").arc("en").left(horiz_dist).arc("sw").up(this.height);
            path2.attrs.class = "top-bind";
            path2.attrs.style = `stroke: ${this.top_bind_color}`;
            path2.addTo(this);
        }

        const rect_attrs = {
            x: x + leftGap,
            y: y - 11,
            width: this.width,
            height: this.up + this.down
        };

        if (this.box_color !== null) {
            rect_attrs.style = `fill: ${this.box_color}; stroke: ${this.line_color || "black"}`;
        }

        new DiagramItem("rect", rect_attrs).addTo(this);

        const textElem = new DiagramItem("text", {
            x: x + leftGap + this.width / 2,
            y: y + 4,
            fill: this.text_color || "black"
        }, this.text);

        if (this.href !== null) {
            const a = new DiagramItem("a", { "xlink:href": this.href }, textElem).addTo(this);
            textElem.addTo(a);
        } else {
            textElem.addTo(this);
        }

        if (this.title !== null) {
            new DiagramItem("title", {}, this.title).addTo(this);
        }

        this.total_height = this.up+this.down;
        return this;
    }

    textDiagram() {
        return TextDiagram.rect(this.text);
    }
}


export class Comment extends DiagramItem {
  constructor(
    text,
    {
      href = null,
      title = null,
      cls = ""
    } = {}
  ) {
    super("g", { class: `non-terminal ${cls}`.trim() });
    this.text = text;
    this.href = href;
    this.title = title;
    this.cls = cls;
    this.width = text.length * COMMENT_CHAR_WIDTH + 10;
    this.up = 8;
    this.down = 8;
    this.needsSpace = true;

    addDebug(this);
  }

  toString() {
    return `Comment(${JSON.stringify(this.text)}, href=${JSON.stringify(this.href)}, title=${JSON.stringify(this.title)}, cls=${JSON.stringify(this.cls)})`;
  }

  format(x, y, width) {
    const [leftGap, rightGap] = determineGaps(width, this.width);

    new Path(x, y).h(leftGap).addTo(this);
    new Path(x + leftGap + this.width, y).h(rightGap).addTo(this);

    const text = new DiagramItem("text", {
      x: x + leftGap + this.width / 2,
      y: y + 5,
      class: "comment"
    }, this.text);

    if (this.href !== null) {
      const a = new DiagramItem("a", { "xlink:href": this.href }, text).addTo(this);
      text.addTo(a);
    } else {
      text.addTo(this);
    }

    if (this.title !== null) {
      new DiagramItem("title", {}, this.title).addTo(this);
    }

    return this;
  }

  textDiagram() {
    return new TextDiagram(0, 0, [this.text]);
  }
}

export class Skip extends DiagramItem {
  constructor() {
    super("g");
    this.width = 0;
    this.up = 0;
    this.down = 0;
    addDebug(this);
  }

  format(x, y, width) {
    new Path(x, y).right(width).addTo(this);
    return this;
  }

  textDiagram() {
    const [line] = TextDiagram._getParts(["line"]);
    return new TextDiagram(0, 0, [line]);
  }

  toString() {
    return "Skip()";
  }
}

export class TextDiagram {
  static parts = {};

  constructor(entry, exit, lines) {
    this.entry = entry;
    this.exit = exit;
    this.lines = lines.slice();
    this.height = lines.length;
    this.width = lines.length > 0 ? lines[0].length : 0;

    const nl = "\n";
    if (entry > this.height) throw new Error(`Entry is not within diagram vertically:${nl}${this._dump(false)}`);
    if (exit > this.height) throw new Error(`Exit is not within diagram vertically:${nl}${this._dump(false)}`);

    for (let i = 0; i < lines.length; i++) {
      if (lines[0].length !== lines[i].length) {
        throw new Error(`Diagram data is not rectangular:${nl}${this._dump(false)}`);
      }
    }
  }

  alter({ entry = null, exit = null, lines = null } = {}) {
    const newEntry = entry ?? this.entry;
    const newExit = exit ?? this.exit;
    const newLines = lines ?? this.lines;
    return new TextDiagram(newEntry, newExit, [...newLines]);
  }

  appendBelow(item, linesBetween, moveEntry = false, moveExit = false) {
    const newWidth = Math.max(this.width, item.width);
    let newLines = [...this.center(newWidth, " ").lines];

    for (const line of linesBetween) {
      newLines.push(TextDiagram._padR(line, newWidth, " "));
    }

    newLines = newLines.concat(item.center(newWidth, " ").lines);

    const newEntry = moveEntry ? this.height + linesBetween.length + item.entry : this.entry;
    const newExit = moveExit ? this.height + linesBetween.length + item.exit : this.exit;

    return new TextDiagram(newEntry, newExit, newLines);
  }

  appendRight(item, charsBetween) {
    const joinLine = Math.max(this.exit, item.entry);
    const newHeight = Math.max(this.height - this.exit, item.height - item.entry) + joinLine;

    const leftTopAdd = joinLine - this.exit;
    const leftBotAdd = newHeight - this.height - leftTopAdd;
    const rightTopAdd = joinLine - item.entry;
    const rightBotAdd = newHeight - item.height - rightTopAdd;

    const left = this.expand(0, 0, leftTopAdd, leftBotAdd);
    const right = item.expand(0, 0, rightTopAdd, rightBotAdd);

    const newLines = [];
    for (let i = 0; i < newHeight; i++) {
      const sep = i === joinLine ? charsBetween : " ".repeat(charsBetween.length);
      newLines.push(left.lines[i] + sep + right.lines[i]);
    }

    return new TextDiagram(left.entry + leftTopAdd, right.exit + rightTopAdd, newLines);
  }

  center(width, pad) {
    if (width < this.width) throw new Error("Cannot center into smaller width");
    if (width === this.width) return this.copy();

    const totalPad = width - this.width;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;

    const left = Array(this.height).fill(pad.repeat(leftPad));
    const right = Array(this.height).fill(pad.repeat(rightPad));

    return new TextDiagram(this.entry, this.exit, TextDiagram._encloseLines(this.lines, left, right));
  }

  copy() {
    return new TextDiagram(this.entry, this.exit, [...this.lines]);
  }

  expand(left, right, top, bottom) {
    if (left + right + top + bottom === 0) return this.copy();

    const line = TextDiagram.parts["line"];
    const newLines = [];

    for (let i = 0; i < top; i++) {
      newLines.push(" ".repeat(this.width + left + right));
    }

    for (let i = 0; i < this.height; i++) {
      const leftStr = i === this.entry ? line.repeat(left) : " ".repeat(left);
      const rightStr = i === this.exit ? line.repeat(right) : " ".repeat(right);
      newLines.push(leftStr + this.lines[i] + rightStr);
    }

    for (let i = 0; i < bottom; i++) {
      newLines.push(" ".repeat(this.width + left + right));
    }

    return new TextDiagram(this.entry + top, this.exit + top, newLines);
  }

  static rect(item, dashed = false) {
    return TextDiagram._rectish("rect", item, dashed);
  }

  static roundrect(item, dashed = false) {
    return TextDiagram._rectish("roundrect", item, dashed);
  }

  static setFormatting(characters = null, defaults = null) {
    if (characters) {
      TextDiagram.parts = {};
      if (defaults) Object.assign(TextDiagram.parts, defaults);
      Object.assign(TextDiagram.parts, characters);
    }

    for (const name in TextDiagram.parts) {
      if (TextDiagram.parts[name].length !== 1) {
        throw new Error(`Text part ${name} is more than 1 character: ${TextDiagram.parts[name]}`);
      }
    }
  }

  _dump(show = true) {
    const nl = "\n";
    let result = `height=${this.height}; len(lines)=${this.lines.length}`;

    if (this.entry > this.lines.length) result += `; entry outside diagram: entry=${this.entry}`;
    if (this.exit > this.lines.length) result += `; exit outside diagram: exit=${this.exit}`;

    for (let y = 0; y < Math.max(this.lines.length, this.entry + 1, this.exit + 1); y++) {
      result += `${nl}[${y.toString().padStart(3, "0")}]`;
      if (y < this.lines.length) result += ` '${this.lines[y]}' len=${this.lines[y].length}`;
      if (y === this.entry && y === this.exit) result += " <- entry, exit";
      else if (y === this.entry) result += " <- entry";
      else if (y === this.exit) result += " <- exit";
    }

    if (show) console.log(result);
    return result;
  }

  static _encloseLines(lines, lefts, rights) {
    if (lines.length !== lefts.length || lines.length !== rights.length) {
      throw new Error("All arguments must be the same length");
    }

    return lines.map((line, i) => lefts[i] + line + rights[i]);
  }

  static _gaps(outerWidth, innerWidth) {
    const diff = outerWidth - innerWidth;
    if (INTERNAL_ALIGNMENT === "left") return [0, diff];
    if (INTERNAL_ALIGNMENT === "right") return [diff, 0];
    const left = Math.floor(diff / 2);
    return [left, diff - left];
  }

  static _getParts(names) {
    return names.map(name => TextDiagram.parts[name]);
  }

  static _maxWidth(...args) {
    let maxWidth = 0;
    for (const arg of args) {
      let width = 0;
      if (arg instanceof TextDiagram) {
        width = arg.width;
      } else if (Array.isArray(arg)) {
        width = Math.max(...arg.map(e => e.length));
      } else {
        width = String(arg).length;
      }
      if (width > maxWidth) maxWidth = width;
    }
    return maxWidth;
  }

  static _padL(str, width, pad) {
    if ((width - str.length) % pad.length !== 0) throw new Error(`Gap ${width - str.length} must be multiple of pad '${pad}'`);
    return pad.repeat((width - str.length) / pad.length) + str;
  }

  static _padR(str, width, pad) {
    if ((width - str.length) % pad.length !== 0) throw new Error(`Gap ${width - str.length} must be multiple of pad '${pad}'`);
    return str + pad.repeat((width - str.length) / pad.length);
  }

  static _rectish(rectType, data, dashed = false) {
    const lineType = dashed ? "_dashed" : "";
    const [
      topLeft, ctrLeft, botLeft,
      topRight, ctrRight, botRight,
      topHoriz, botHoriz,
      line, cross
    ] = TextDiagram._getParts([
      `${rectType}_top_left`,
      `${rectType}_left${lineType}`,
      `${rectType}_bot_left`,
      `${rectType}_top_right`,
      `${rectType}_right${lineType}`,
      `${rectType}_bot_right`,
      `${rectType}_top${lineType}`,
      `${rectType}_bot${lineType}`,
      "line",
      "cross"
    ]);

    const itemTD = data instanceof TextDiagram ? data : new TextDiagram(0, 0, [data]);

    let lines = [topHoriz.repeat(itemTD.width + 2)];
    if (data instanceof TextDiagram) {
      lines = lines.concat(itemTD.expand(1, 1, 0, 0).lines);
    } else {
      for (let i = 0; i < itemTD.lines.length; i++) {
        lines.push(" " + itemTD.lines[i] + " ");
      }
    }
    lines.push(botHoriz.repeat(itemTD.width + 2));

    const entry = itemTD.entry + 1;
    const exit = itemTD.exit + 1;

    const leftMax = TextDiagram._maxWidth(topLeft, ctrLeft, botLeft);
    const lefts = Array(lines.length).fill(TextDiagram._padR(ctrLeft, leftMax, " "));
    lefts[0] = TextDiagram._padR(topLeft, leftMax, topHoriz);
    lefts[lines.length - 1] = TextDiagram._padR(botLeft, leftMax, botHoriz);
    if (data instanceof TextDiagram) lefts[entry] = cross;

    const rightMax = TextDiagram._maxWidth(topRight, ctrRight, botRight);
    const rights = Array(lines.length).fill(TextDiagram._padL(ctrRight, rightMax, " "));
    rights[0] = TextDiagram._padL(topRight, rightMax, topHoriz);
    rights[lines.length - 1] = TextDiagram._padL(botRight, rightMax, botHoriz);
    if (data instanceof TextDiagram) rights[exit] = cross;

    lines = TextDiagram._encloseLines(lines, lefts, rights);

    const midLeft = Array(lines.length).fill(" ");
    midLeft[entry] = line;
    const midRight = Array(lines.length).fill(" ");
    midRight[exit] = line;

    lines = TextDiagram._encloseLines(lines, midLeft, midRight);

    return new TextDiagram(entry, exit, lines);
  }

  toString() {
    return `TextDiagram(${this.entry}, ${this.exit}, ${JSON.stringify(this.lines)})`;
  }
}

TextDiagram.setFormatting(TextDiagram.PARTS_UNICODE); // Or .PARTS_ASCII if preferred


// Global rendering entry point
window.add = function(title, diagram) {
  const area = document.getElementById("diagramArea");

  // Create section wrapper
  const section = document.createElement("div");
  section.style.marginBottom = "2em";

  // Title
  const heading = document.createElement("h2");
  heading.textContent = title;
  section.appendChild(heading);

  // SVG canvas
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1000");
  svg.setAttribute("height", "100");

  // Render the diagram
  diagram.render(svg);
  section.appendChild(svg);

  area.appendChild(section);
};
