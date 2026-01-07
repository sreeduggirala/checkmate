const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9876');

ws.on('open', () => {
  console.log('Connected to daemon!\n');

  // Send a request to add a multiply function
  const request = {
    type: 'run_cycle',
    request: 'Add a multiply function to the calculator with proper test coverage. Make sure to handle edge cases like multiplying by zero and negative numbers.'
  };

  console.log('Sending request:', request.request);
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
      console.log(`Issues: ${event.review.issues.length}`);
      event.review.issues.forEach((issue, i) => {
        console.log(`\n  ${i + 1}. [${issue.severity}] ${issue.description}`);
      });
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
