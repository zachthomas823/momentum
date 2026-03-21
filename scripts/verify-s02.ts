import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, text: string): boolean {
  try {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    return content.includes(text);
  } catch {
    return false;
  }
}

console.log('\n🔍 S02 Structural Verification\n');

// Component files
console.log('📁 Log Components:');
check('DateSelector.tsx exists', fileExists('components/log/DateSelector.tsx'));
check('DietCard.tsx exists', fileExists('components/log/DietCard.tsx'));
check('AlcoholCard.tsx exists', fileExists('components/log/AlcoholCard.tsx'));
check('WeightCard.tsx exists', fileExists('components/log/WeightCard.tsx'));
check('SleepCard.tsx exists', fileExists('components/log/SleepCard.tsx'));
check('ExerciseCard.tsx exists', fileExists('components/log/ExerciseCard.tsx'));

// UI primitives
console.log('\n📁 UI Primitives:');
check('Card.tsx exists', fileExists('components/ui/Card.tsx'));
check('Pill.tsx exists', fileExists('components/ui/Pill.tsx'));
check('Btn.tsx exists', fileExists('components/ui/Btn.tsx'));
check('Label.tsx exists', fileExists('components/ui/Label.tsx'));

// Shell
console.log('\n📁 Shell:');
check('Shell.tsx exists', fileExists('components/Shell.tsx'));

// API routes
console.log('\n📁 API Routes:');
const apiRoutes = ['diet', 'alcohol', 'weight', 'sleep', 'exercise'];
for (const type of apiRoutes) {
  const routePath = `app/api/logs/${type}/route.ts`;
  check(`${routePath} exists`, fileExists(routePath));
  check(`${type} route exports GET`, fileContains(routePath, 'export async function GET'));
  check(`${type} route exports POST`, fileContains(routePath, 'export async function POST'));
}

// Layout files
console.log('\n📁 Layouts:');
check('app/layout.tsx exists', fileExists('app/layout.tsx'));
check('app/(tabs)/layout.tsx exists', fileExists('app/(tabs)/layout.tsx'));

// Log page
console.log('\n📁 Log Page:');
check('app/(tabs)/log/page.tsx exists', fileExists('app/(tabs)/log/page.tsx'));
check('Log page is a client component', fileContains('app/(tabs)/log/page.tsx', 'use client'));

// Design system
console.log('\n📁 Design System:');
check('globals.css contains @theme', fileContains('app/globals.css', '@theme'));

// Summary
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ All S02 structural checks passed!\n');
