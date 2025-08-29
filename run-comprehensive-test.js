import fs from 'fs';
import path from 'path';
import { interpret, getInitialState } from './interpreter.js';

async function main() {
    const filePath = path.join(process.cwd(), 'comprehensive-test.my_lang');
    const code = fs.readFileSync(filePath, 'utf8');

    const onChunk = (chunk) => process.stdout.write(chunk);
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const state = getInitialState(
        { onChunk, wait },
        { enableFs: false, enableShell: false }
    );

    console.log('Running Comprehensive Interpreter Test Suite...\n');

    const startTime = Date.now();

    try {
        await interpret(code, state);
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`\n✅ All tests completed successfully in ${duration}ms!`);
    } catch (error) {
        console.error('\n❌ Test suite failed with error:');
        console.error('Error:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Unexpected error running test suite:', error);
    process.exit(1);
});
