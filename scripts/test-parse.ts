import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'fs';
import { parseQuestions } from '../src/lib/tcf/parse';

const PDF_PATH = '<TCF_LISTENING_DIR>/Compréhension orale test 1 (Member) - 题库.pdf';

async function main() {
  const buf = readFileSync(PDF_PATH);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  await parser.destroy();

  const questions = parseQuestions(result.text);
  console.log(`Parsed ${questions.length} questions\n`);

  const known = JSON.parse(readFileSync('test1-q1-19.json', 'utf8')) as Array<{
    num: number; type: string; correctIndex: number; options: string[];
  }>;

  let pass = 0;
  for (const q of questions.slice(0, 19)) {
    const ref = known.find(k => k.num === q.orderIndex);
    if (!ref) { console.log(`Q${q.orderIndex}: no ref`); continue; }
    const typeMatch = q.type === ref.type;
    const answerMatch = q.answer === ref.correctIndex;
    const optsMatch = q.options.length === 4;
    const ok = typeMatch && answerMatch && optsMatch;
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} Q${String(q.orderIndex).padStart(2)} [${q.type.padEnd(14)}] ans=${q.answer} (ref=${ref.correctIndex}) opts=${q.options.length}`);
    if (!ok) {
      console.log('   parsed:', q.options);
      console.log('   ref:   ', ref.options);
    }
  }
  console.log(`\n${pass}/19 passed`);

  console.log('\n--- Q1 (image) ---');
  console.log(JSON.stringify(questions[0], null, 2));
  console.log('\n--- Q5 (spoken_options) ---');
  console.log(JSON.stringify(questions[4], null, 2));
  console.log('\n--- Q11 (dialogue) ---');
  console.log(JSON.stringify(questions[10], null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
