// What the AI is asked when the user takes a screenshot during a session.
// The session's own instructions (profile, resume, answer style) are sent alongside, so the screenshot answer
// follows the same voice as the spoken answers.

const SCREENSHOT_INSTRUCTION = `SCREENSHOT TASK

The user shared a screenshot of their screen during a live session. Work out what it shows and give the most useful response right now. Follow the session's profile, the user's background and the answer style given above.

If there is a direct question anywhere on the screen (even at the bottom of a slide or in a chat), answer that question first, then add anything else that helps.

What to do depends on what is on screen:
- A coding or technical question: start with the approach in a few short bullets, then the complete, working code in a code block, then the time and space complexity and any edge cases worth mentioning.
- A multiple-choice question: give the correct option (letter and text) first, then one or two lines on why. If several questions are visible, answer each in order.
- A question to answer in words (interview, form, essay, chat message, survey): write the answer the user can say or type, in their voice, following the session style.
- An error message, log or terminal output: say what it means and the most likely fix, with the exact command or change.
- A slide, document, chart or table: give the key point in a sentence or two, then what the user could say about it.
- An email or chat conversation: say what is being asked and write a short reply the user can send.
- Anything else: say what matters and what to do about it.

Start with the answer itself. Do not begin with "The screenshot shows" or describe the screen unless that is the answer. If part of the text is cropped, blurry or unreadable, say exactly what is missing in one line and still give your best answer. Never invent details that are not on the screen or in the user's background.`;

const DEFAULT_SCREENSHOT_PROMPT = 'Help me with what is on this screen.';

module.exports = { SCREENSHOT_INSTRUCTION, DEFAULT_SCREENSHOT_PROMPT };
