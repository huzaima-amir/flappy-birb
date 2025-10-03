/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    catchError,
    filter,
    fromEvent,
    interval,
    map,
    scan,
    switchMap,
    take,
    merge,
    ReplaySubject,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    PIPE_WIDTH: 50,
    TICK_RATE_MS: 20, // 50 updates per second
} as const;

// to handle birb movement smoothly:
const Physics = {
    GRAVITY: 0.25, // downward acceleration
    FLAP_LIFT: -3.5, // upward velocity when flapping (using spacebar) 
    MAX_VY: 6, // capping downward velocity by gravity to prevent uncontrollable birb
} as const; 


/** Pipes  */
// Pipe data from CSV (has time, no x yet)
type PipeSpec = Readonly<{
    gapY: number;
    gapHeight: number;
    time: number; // ms
}>;

// Pipe in the game state (has x, but no time)
type Pipe = Readonly<{
    x: number;
    gapY: number;
    gapHeight: number;
    scored?: boolean; // true once birb has passed this pipe
}>;

const PIPE_SPEED = 2; // pixels per tick


/** Helper functions */

// To handle pipes data from csv
const parsePipes = (csvContents: string): PipeSpec[] => {
    const lines = csvContents.trim().split("\n").slice(1); // skip header
    return lines.map(line => {
        const [gap_y, gap_height, time] = line.split(",").map(Number);
        return {
            x: Viewport.CANVAS_WIDTH,
            gapY: gap_y * Viewport.CANVAS_HEIGHT,
            gapHeight: gap_height * Viewport.CANVAS_HEIGHT,
            time: time * 1000, // convert to ms
        };
    });
};

//To handle collisions:
// Check if the birb hits the ground or ceiling
const hitBoundary = (y: number): boolean =>
  y < 0 || y + Birb.HEIGHT > Viewport.CANVAS_HEIGHT;

// Check if the birb overlaps with a pipe 
const hitPipe = (birbX: number, birbY: number, pipe: Pipe): boolean => {
  const birbRight = birbX + Birb.WIDTH;
  const birbBottom = birbY + Birb.HEIGHT;

  const pipeLeft = pipe.x;
  const pipeRight = pipe.x + Constants.PIPE_WIDTH;
  const gapTop = pipe.gapY - pipe.gapHeight / 2;
  const gapBottom = pipe.gapY + pipe.gapHeight / 2;

  const withinPipeX = birbRight > pipeLeft && birbX < pipeRight;
  const outsideGapY = birbY < gapTop || birbBottom > gapBottom;

  return withinPipeX && outsideGapY;
};


// User input

type Key = "Space";

// State processing

type State = Readonly<{
    gameEnd: boolean; 
    y: number; // birb's vertical position (on the y-axis)
    vy: number; // birb's vertical velocity (distance covered per tick)
    lives: number; // remaining lives
    score: number; 
    pipes: ReadonlyArray<Pipe>;
    time: number;       // elapsed time in ticks
    crashed: boolean; // true for exactly one tick after a crash
    victory: boolean; // true once all pipes from csv are passed - game ends
}>;

const initialState: State = {
    gameEnd: false, // whether the game has finished  - set to true when player loses?
    y: Viewport.CANVAS_HEIGHT/2 - Birb.HEIGHT/2,
    vy: 0,
    lives: 3,
    score: 0, // how many pipes created?
    pipes: [],
    time: 0,
    crashed: false,
    victory: false,
};

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State, allPipes: PipeSpec[]): State => {
  const newVy = Math.min(s.vy + Physics.GRAVITY, Physics.MAX_VY);
  const newY = s.y + newVy;
  const newTime = s.time + Constants.TICK_RATE_MS;
  const birbX = Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2;

  // Move and spawn new pipes only if game not over
  const movedPipes = s.gameEnd
    ? s.pipes
    : s.pipes
        .map(p => ({ ...p, x: p.x - PIPE_SPEED }))
        .filter(p => p.x + Constants.PIPE_WIDTH > 0);

  const upcoming = s.gameEnd
    ? []
    : allPipes.filter(p => p.time <= newTime && p.time > s.time);

  const newPipes = upcoming.map(p => ({
    x: Viewport.CANVAS_WIDTH,
    gapY: p.gapY,
    gapHeight: p.gapHeight,
    scored: false,
  }));

  // Merge pipes and compute score incrementally 
  const { pipes, score } = [...movedPipes, ...newPipes].reduce(
    (acc, p) => {
      if (!p.scored && p.x + Constants.PIPE_WIDTH < birbX) {
        return {
          pipes: [...acc.pipes, { ...p, scored: true }],
          score: acc.score + 1,
        };
      } else {
        return {
          pipes: [...acc.pipes, p],
          score: acc.score,
        };
      }
    },
    { pipes: [] as Pipe[], score: s.score }
  );

  // Collision detection 
  const boundaryCrash = hitBoundary(newY);
  const pipeCrash = pipes.some(p => hitPipe(birbX, newY, p));
  const crashNow = boundaryCrash || pipeCrash;

  // Handle lives and game over 
  // Decrement life only if its a new crash, not for continuous contact
  const lives = crashNow && !s.crashed && !s.gameEnd ? s.lives - 1 : s.lives;
  const gameEnd = crashNow && !s.crashed && lives <= 0 ? true : s.gameEnd;

  // Bounce birb upon collision
    const bounceVy = crashNow
    ? (
        newY <= 0 || pipeCrash && newY < Viewport.CANVAS_HEIGHT / 2
          ? Math.random() * (4 - 2) + 2      // bounce down (2..4)
          : -(Math.random() * (4 - 2) + 2)   // bounce up (-4..-2)
      )
    : newVy;

      // Victory condition: all pipes spawned & passed
    const allSpawned = allPipes.every(p => p.time <= newTime);
    const allCleared = pipes.length === 0;
    const victory = !s.gameEnd && allSpawned && allCleared;

  // Return new state 
  return {
    ...s,
       y: crashNow
      ? Math.max(0, Math.min(newY, Viewport.CANVAS_HEIGHT - Birb.HEIGHT))
      : newY,
    vy: crashNow ? bounceVy : newVy,
    time: newTime,
    pipes,
    lives,
    score,
    gameEnd: gameEnd || victory, // end game on 3 crashes OR victory
    crashed: crashNow, // record crash status for next tick
    victory,
  };


};

// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

const render = (): ((s: State) => void) => {
    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const container = document.querySelector("#main") as HTMLElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;

    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );
    /**
     * Renders the current state to the canvas.
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */


    return (s: State) => {
        //  Clear old frame
        Array.from(svg.children).forEach(child => {
            if (child.id !== "gameOver") {
                svg.removeChild(child);
            }
        });

        // Add birb to the main grid canvas
        const birdImg = createSvgElement(svg.namespaceURI, "image", {
            href: "assets/birb.png",
            x: `${Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2}`,
            y: `${s.y}`,
            width: `${Birb.WIDTH}`,
            height: `${Birb.HEIGHT}`,
        });
        svg.appendChild(birdImg);



    s.pipes.forEach(pipe => {
        const topHeight = pipe.gapY - pipe.gapHeight / 2;
        const bottomY = pipe.gapY + pipe.gapHeight / 2;

        const pipeTop = createSvgElement(svg.namespaceURI, "rect", {
            x: `${pipe.x}`,
            y: "0",
            width: `${Constants.PIPE_WIDTH}`,
            height: `${topHeight}`,
            fill: "green",
        });

        const pipeBottom = createSvgElement(svg.namespaceURI, "rect", {
            x: `${pipe.x}`,
            y: `${bottomY}`,
            width: `${Constants.PIPE_WIDTH}`,
            height: `${Viewport.CANVAS_HEIGHT - bottomY}`,
            fill: "green",
        });

        svg.appendChild(pipeTop);
        svg.appendChild(pipeBottom);
    });

    // Update game status
    livesText.textContent = s.lives.toString();
    scoreText.textContent = s.score.toString();

    // Game over message overlay 
    hide(gameOver);
    if (s.gameEnd) { show(gameOver)}

    };
};



type GameEvent = "tick" | "flap" | "restart";

export const state$ = (csvContents: string): Observable<State> => {
  // parse once and keep in closure
  const allPipes: PipeSpec[] = parsePipes(csvContents);

  const tick$ = interval(Constants.TICK_RATE_MS).pipe(map(() => "tick" as const));
  const key$ = fromEvent<KeyboardEvent>(document, "keydown");

    const flap$ = key$.pipe( 
        filter((
            { code }) => code === "Space"), 
        map(() => "flap" as const) );

  // Restart game after game end
  const restart$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
  filter(({ code }) => code === "Enter"),
  map(() => "restart" as const)
);

  return merge(tick$, flap$, restart$).pipe(
    scan((s: State, event: GameEvent) => {
      if (event === "tick") {
        // pass allPipes into tick so it can spawn/move pipes
        return tick(s, allPipes);
      } else if (event === "flap") {
        return { ...s, vy: Physics.FLAP_LIFT };
    } else if (event === "restart") {
        return initialState; // fully reset  
    } else {
        return s;
      }
    }, initialState)
  );
};




// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    const csvUrl = `${baseUrl}/assets/map.csv`;

    // Get the file from URL
    const csv$ = fromFetch(csvUrl).pipe(
        switchMap(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`Fetch error: ${response.status}`);
            }
        }),
        catchError(err => {
            console.error("Error fetching the CSV file:", err);
            throw err;
        }),
    );

    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    csv$.pipe(
        switchMap(contents =>
            // On click - start the game
            click$.pipe(switchMap(() => state$(contents))),
        ),
    ).subscribe(render());
}