const assert = require('assert');
const { wordErrorRate, keyWordRecall, normalize } = require('./wer');

assert.strictEqual(wordErrorRate('Tell me about yourself.', 'tell me about yourself'), 0);
assert.strictEqual(wordErrorRate('tell me about yourself', 'tell me about your cell'), 0.5); // 1 swap + 1 extra word over 4
assert.strictEqual(wordErrorRate('one two three four', ''), 1);
assert.strictEqual(wordErrorRate('', ''), 0);
assert.strictEqual(normalize('[Interviewer]: Hello, World!'), 'hello world');
assert.strictEqual(keyWordRecall('Describe your biggest weakness', 'describe your biggest weeknes'), 0.75); // describe, your, biggest heard; weakness not
console.log('wer tests passed');
