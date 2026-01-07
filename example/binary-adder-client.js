const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9876');

ws.on('open', () => {
  console.log('Connected to Checkmate daemon!\n');

  // Send a request to add a binary adder function
  const request = {
    type: 'run_cycle',
    request: 'Add a binaryAdder function to src/calculator.ts that takes two binary strings (e.g., "1010", "1101") and returns their sum as a binary string. Include comprehensive tests in test/calculator.test.ts covering edge cases like empty strings, different length inputs, and carry overflow.'
  };

  console.log('Request:', request.request);
  console.log('='.repeat(80));
  console.log();

  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  const event = message.event;

  switch (event.type) {
    case 'status':
      console.log(`\n[STATUS] ${event.message}`);
      break;

    case 'stream_chunk':
      process.stdout.write(event.chunk);
      break;

    case 'patch_ready':
      console.log('\n\n[PATCH READY]');
      console.log(event.patch);
      break;

    case 'tests_output':
      console.log('\n\n[TEST OUTPUT]');
      console.log(event.stdout);
      if (event.stderr) console.log('Errors:', event.stderr);
      console.log(`Exit code: ${event.exitCode}`);
      break;

    case 'review_ready':
      console.log('\n\n[REVIEW]');
      console.log(`Verdict: ${event.review.verdict}`);
      const critical = event.review.issues.filter(i => i.severity === 'critical');
      const major = event.review.issues.filter(i => i.severity === 'major');
      const minor = event.review.issues.filter(i => i.severity === 'minor');
      console.log(`Critical Issues: ${critical.length}`);
      critical.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue.description}`);
      });
      console.log(`Major Issues: ${major.length}`);
      major.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue.description}`);
      });
      console.log(`Minor Issues: ${minor.length}`);
      minor.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue.description}`);
      });
      if (event.review.extra_tests && event.review.extra_tests.length > 0) {
        console.log(`\nSuggested Tests: ${event.review.extra_tests.length}`);
        event.review.extra_tests.forEach((test, i) => {
          console.log(`  ${i + 1}. ${test}`);
        });
      }
      if (event.review.stopping) {
        console.log(`\nReasoning: ${event.review.stopping}`);
      }
      break;

    case 'cycle_complete':
      console.log('\n\n[CYCLE COMPLETE]');
      console.log(`Success: ${event.success}`);
      console.log(`Message: ${event.message}`);
      console.log(`Iterations: ${event.iterations}`);
      console.log('\n' + '='.repeat(80));
      ws.close();
      break;

    case 'error':
      console.error('\n\n[ERROR]', event.error);
      ws.close();
      break;
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('\nConnection closed');
  process.exit(0);
});

