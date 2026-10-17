# Accuracy test kit

This tool answers one question: **how well do speech engines understand real people asking interview questions, in different accents?**

You give it short recordings. It plays each one to Gemini (and optionally other services), compares what was heard with what was actually said, and prints a score per accent.

## What you need

- Node.js and `ffmpeg` installed (ffmpeg reads the recordings).
- A Gemini API key. Use a spare key with a small spending cap, and put it in the environment (never in a file):
  `GEMINI_API_KEY=your-key`
- Optional, to compare another service: `DEEPGRAM_API_KEY=your-key`

## Step 1: record the clips

Ask a few people (the more different accents, the better) to read questions from `questions.txt` aloud and record them on a phone. About 10 questions each is plenty.

Name each recording `accent-name-qNN.ext`, where NN is the question number:

- `yoruba-ada-q07.m4a` (Ada, Yoruba accent, question 7)
- `british-tom-q02.mp3`
- `pidgin-emeka-q15.wav`

Put them all in one folder, for example `clips/`. Any normal audio format works. Tip: record the way the app will actually hear it, for example play the question through a laptop speaker on a video call, and record that. Real conditions are the point.

## Step 2: build the answer sheet

    node tools/accuracy/make-manifest.js clips

This reads the file names and writes `clips/manifest.csv` with the correct words for each clip.

## Step 3: run the test

    GEMINI_API_KEY=... node tools/accuracy/run.js --clips clips

Useful options:

- `--engines gemini-live,gemini-batch,deepgram` compares more than one engine on the same clips.
  - `gemini-live`: what the app uses today (live listening).
  - `gemini-batch`: Gemini listening to the whole clip at once. Shows the best Gemini can do.
  - `deepgram`: an alternative speech service.
- `--judge gemini-2.5-flash` also checks whether the assistant would still answer the same question, which matters more than a single wrong word.
- `--limit 10` tries only the first 10 clips (a cheap first run).
- `--concurrency 3` how many clips run at once.
- `--speed 2` plays the clips faster than real time to finish sooner (may lower accuracy).
- `--live-model` and `--batch-model` choose the Gemini models.

## How to read the results

A table per engine, one row per accent:

- **Words right**: the share of words heard correctly. 90% means about one wrong word in ten.
- **Key words heard**: the share of the important words (more than 3 letters) that came through.
- **Clips with 85%+ words right**: how many clips reached your 85 to 90% goal.
- **Same question understood**: with `--judge`, how often the heard version would lead to the same answer.

Results are saved to `clips/results/` as a readable `.md` file and a `.json` file with every clip. The report also lists the five worst clips so you can see the real mistakes, and the average tokens used by the live engine (which shows what listening costs).

## Check the tool itself

    node tools/accuracy/wer.test.js
    node tools/accuracy/run.js --clips clips --engines mock

The `mock` engine pretends to hear everything with one wrong word. It needs no key and proves the tool works.

## Fair-use note

Only record people who agree to it, and keep the recordings private. Public speech collections have their own licences (for example AfriSpeech is for research only).
