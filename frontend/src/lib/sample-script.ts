export const SAMPLE_SCRIPT_FILENAME = "THE_GEOMETRY_OF_ROOMS_SAMPLE.txt";
export const SAMPLE_SCRIPT_TITLE = "The Geometry of Rooms";

export const SAMPLE_SCRIPT_TEXT = `THE GEOMETRY OF ROOMS

LOGLINE: Navigating the cold thresholds between two entirely different worlds, a woman
relies on the language of mathematics gifted by her parents to decipher the geometry of
human connection, finally finding her place in rooms built on shared purpose.

INT. TRAIN CARRIAGE - NIGHT

A window pane. Outside, the world rushes by in streaks of stark, freezing midnight blue.
Frost edges the glass. A young hand presses against the cold pane. The reflection of a
girl—MARIA—ghostly and faint.

MARIA (V.O.)
Adapting is not a choice. It is the very first thing I ever learned to do.

Through the frost, the towering, concrete skyline of Berlin emerges. Year 2000. Steely,
imposing, gray.

MARIA (V.O.)
Born in Kazakhstan. Arrived in Berlin.

The hand pulls away from the freezing glass. It leaves a temporary, fading handprint.

MARIA (V.O.)
For a long time, the space between those two worlds was a chasm. It is a heavy thing, to
look at the world and feel that because of where you come from, you belong nowhere.

INT. CORRIDOR / EMPTY ROOM - DAY

A heavy wooden door stands ajar. Maria stands in the dimly lit hallway, looking IN. The
light inside is cool, sterile.

Inside the room, blurred, out-of-focus shapes move—the backs and shoulders of people. We
never see their faces. They are a chaotic system.

Maria stands at the threshold. Still. Her eyes darting from shape to shape, analyzing the
space, the distance between the figures, the unspoken currents.

MARIA (V.O.)
I learned to read a room before I ever dared to speak in one. To observe the culture. To
find the structure in the open space.

INT. CHILDHOOD BEDROOM - NIGHT (MEMORY)

A sudden shift in temperature. The screen is filled with a pool of deep, warm amber light
spilling from a desk lamp. A blank sheet of grid paper.

Two large, adult hands—her PARENTS' hands—gently guide a smaller pair of hands into the
light.

MARIA (V.O.)
I survived the chaos because I was given a sanctuary of logic.

The hands hold a simple wooden pencil. Together, they draw a right-angled triangle.

MARIA (V.O.)
Mathematics. Where things are not just memorized, but understood.

The parents' hands do not write an equation. Instead, they carefully draw a square
extending from the shortest side of the triangle. Then another square on the bottom.
Finally, a large square extending from the longest side. They fill the squares with tiny,
perfectly measured grid boxes. The parents' hands guide the small finger to count them.
Demonstrating the geometry. Proving why the Pythagorean theorem works.

The small hands press against the paper, tracing the absolute certainty of the shapes.

MARIA (V.O.)
They never made me learn the Pythagorean theorem by heart. They showed me the foundation.
They showed me why the equation looks the way it does.

The camera pushes in on the paper. The geometry is perfect.

MARIA (V.O.)
They taught me that underneath it all, there is a logic. A clear solution to a real
problem.

INT. OFFICE - DAY

A computer screen glowing with columns of numbers. A vast, complex spreadsheet of pricing
models. Maria sits in the glow of the data. The light here is balanced. Neither freezing
nor entirely warm.

MARIA (V.O.)
That love of data became my first room. Analyzing pricing. Finding the hidden architecture
in the numbers.

She scrolls. The numbers reflect in her eyes. A genuine, deep focus.

MARIA (V.O.)
But the numbers alone were not enough.

INT. COLLABORATION SPACE - LATE AFTERNOON

The light warms significantly. Golden hour streams through wide windows. Maria stands at a
large drafting table. Beside her, three other figures—we see their arms, their hands,
their rolled-up sleeves.

They are arranging physical objects, moving sticky notes, drawing diagrams that look
remarkably like the geometric shapes from her childhood.

MARIA (V.O.)
I moved into product management. Because what I truly loved was not just the structure...
it was building the structure.

Maria's hand points to a design. Another hand slides a piece of paper to connect with
hers. They fit together.

MARIA (V.O.)
And building it with people. Learning together in communities.

INT. TOASTMASTERS HALL - EVENING

Warm, incandescent light bathes a small wooden stage. Maria stands at the center. Before
her, the backs of an audience sitting in neatly arranged chairs.

She is silent for a moment. Reading the room. Just as she did in the cold corridor, but
now, the shadows are not intimidating. They are receptive.

She breathes in. Her posture straightens. She begins to speak. We do not hear her words,
only the steady rhythm of her voice-over.

MARIA (V.O.)
I train myself to speak, to communicate, because I no longer view my two worlds as a
loss. I take the best from both.

She gestures with open hands. Open-minded. Structured. The audience nods—a collective,
rhythmic response.

INT. THRESHOLD - DUSK

Another door stands ajar. But Maria is no longer standing in a cold, dark hallway looking
in. She is already inside.

The room is bathed in rich, warm light. The blur of people moving in the background feels
harmonious, like a perfectly balanced equation.

She turns to face the camera. Her expression is calm, settled, and profoundly present.

MARIA (V.O.)
To work with people on something meaningful. To keep learning.

She steps further into the room, joining the shapes of the people.

MARIA (V.O.)
To build something valuable.

FADE TO BLACK.
`;

export function sampleScriptFile(): File {
  return new File([SAMPLE_SCRIPT_TEXT], SAMPLE_SCRIPT_FILENAME, { type: "text/plain" });
}
