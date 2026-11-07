# Overtone

Paint pictures with sound. Describe a scene, and Overtone composes a piece of music whose spectrogram (the picture of a sound's pitches over time) is that scene.

There is no AI and no server. Everything runs in the browser.

Names and things the built-in sketchbook doesn't know (people, places, paintings, characters) are looked up on Wikipedia, and the article's pictures are traced into line art. Only those words are sent to Wikipedia, and the "Look up names" setting turns it off.

## Try it

Open `index.html` in Chrome or Safari, type a scene, and press **Paint** with your sound on. You can also paint an image or a video from the Image and Video tabs.

**Record video** types your prompt, paints it, and saves an MP4 (16:9, 1:1 or 9:16) with sound, ready for X. **WAV** saves the audio alone. Open the WAV in any spectrogram viewer, like Audacity or Spek, and the same picture appears.

**Remix** keeps the scene but picks a new key, chord progression and scenery. Settings and your last prompt are remembered between visits.

## How it works

Figures dress for their role (chef hat, crown, wizard hat, pirate hat, shades for a dude, glasses and a cane for grandpa), kids and babies are smaller, and groups ("two friends", "a family", "a king and a queen") walk together. Feelings and conversations have their own scenes: losing or crying under a rain cloud, laughing, talking and arguing in speech bubbles, fighting, thinking in thought bubbles, and flying.

1. **Words pick drawings.** `sketchbook.js` reads the prompt for people, actions (throw, kick, run, jump, dance, swim, ride, fly a kite, sit, cheer), objects, animals, places and times of day. Actions become little stories with a posed figure: a javelin thrower runs up, winds up, releases, and the javelin's flight is traced by a melody. It fixes small typos, traces about 200 everyday things from the system emoji font, and writes out anything else as lettering.
2. **Pixels become notes.** Left to right is time, bottom to top is pitch on a log scale, and brightness is loudness. `engine.js` turns every bright pixel into a sine wave at its pitch, tuned to the overtones of the current chord, and composes a bass line, arpeggios and drums underneath.
3. **The screen only listens.** `app.js` draws a live spectrogram from the browser's AnalyserNode. It also computes the same spectrogram in the background, so you can jump anywhere on the score.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Layout and styles |
| `engine.js` | Frequency mapping, music, synthesis, color palettes, FFT, WAV export |
| `sketchbook.js` | Drawings, the scene planner, image and video processing |
| `emoji-words.js` | About 1,400 nouns mapped to emoji, generated from Unicode emoji names |
| `app.js` | Interface, audio graph, live spectrogram, timeline, recording |
| `icon.svg` | Logo |

To add a drawing, write a function in `sketchbook.js` and add an entry to `SUBJECTS` with the words that should trigger it. Set `GITHUB_URL` in `app.js` to link the About panel to the repository.

