const fs = require('fs');
const path = require('path');
const { interpret, getInitialState } = require('./interpreter');

async function main() {
    const filePath = path.join(__dirname, 'test_array_indexing.my_lang');
    const code = fs.readFileSync(filePath, 'utf8');

    const onChunk = (chunk) => process.stdout.write(chunk);
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const state = getInitialState(
        { onChunk, wait },
        { enableFs: false, enableShell: false }
    );

    console.log('=== Running Array Indexing Tests ===\n');

    try {
        await interpret(code, state);
        console.log('\n=== All tests passed! ===');
    } catch (error) {
        console.error('\n--- Test Error ---');
        console.error(error);
        process.exit(1);
    }
}

main();
