/**
 * Test E2E simplificado para Bounce Handling
 * Foco: verifi car que el webhook procesa bounces correctamente
 * Ejecutar: node test-bounce-simple.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:4600';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    console.log(`\n📋 ${name}`);
    await fn();
    console.log(`✓ PASSED`);
    passed++;
  } catch (err) {
    console.log(`✗ FAILED: ${err.message}`);
    failed++;
  }
}

async function api(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();

  return { status: res.status, data };
}

// Test 1: Health check
await test('Server health check', async () => {
  const result = await api('GET', '/api/health');
  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Health check failed');
  console.log('   Server is running on port 4600');
});

// Test 2: Hard bounce webhook
await test('Hard bounce webhook (Permanent)', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: `test-hard-${Date.now()}`,
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [
          { emailAddress: 'test-hard@example.com', status: '5.1.1' }
        ],
        timestamp: new Date().toISOString()
      }
    })
  });

  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Webhook failed');
  if (!result.data.results[0]) throw new Error('No results');
  if (result.data.results[0].bounceStatus !== 'hard') throw new Error('Wrong bounce status');
  console.log(`   Processed: ${result.data.results[0].email}`);
  console.log(`   Bounce status: ${result.data.results[0].bounceStatus}`);
});

// Test 3: Soft bounce webhook
await test('Soft bounce webhook (Temporary)', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: `test-soft-${Date.now()}`,
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Temporary',
        bouncedRecipients: [
          { emailAddress: 'test-soft@example.com', status: '4.2.3' }
        ],
        timestamp: new Date().toISOString()
      }
    })
  });

  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Webhook failed');
  if (!result.data.results[0]) throw new Error('No results');
  if (result.data.results[0].bounceStatus !== 'soft') throw new Error('Wrong bounce status');
  console.log(`   Processed: ${result.data.results[0].email}`);
  console.log(`   Bounce status: ${result.data.results[0].bounceStatus}`);
});

// Test 4: Multi-recipient bounce
await test('Multi-recipient bounce', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: `test-multi-${Date.now()}`,
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [
          { emailAddress: 'user1@example.com', status: '5.1.1' },
          { emailAddress: 'user2@example.com', status: '5.1.1' },
          { emailAddress: 'user3@example.com', status: '5.1.1' }
        ],
        timestamp: new Date().toISOString()
      }
    })
  });

  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Webhook failed');
  if (result.data.totalProcessed !== 3) throw new Error(`Expected 3 recipients, got ${result.data.totalProcessed}`);
  console.log(`   Processed ${result.data.totalProcessed} recipients`);
  result.data.results.forEach(r => {
    console.log(`   - ${r.email}: ${r.bounceStatus} bounce`);
  });
});

// Test 5: SNS subscription confirmation
await test('SNS SubscriptionConfirmation', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'SubscriptionConfirmation',
    MessageId: 'test-sub-001',
    TopicArn: 'arn:aws:sns:us-east-1:123:mailux-bounces',
    SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&...'
  });

  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Subscription confirmation failed');
  console.log('   Subscription confirmed');
});

// Test 6: Invalid bounce data handling
await test('Invalid bounce data (missing type)', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: 'test-invalid-001',
    Message: JSON.stringify({
      bounce: {
        bounceSubType: 'Undetermined'
        // Missing bounceType and bouncedRecipients
      }
    })
  });

  if (result.status !== 400) throw new Error(`Expected 400, got ${result.status}`);
  if (!result.data.error) throw new Error('Expected error message');
  console.log(`   Error handling OK: ${result.data.error}`);
});

// Test 7: Webhook without bounce data
await test('Notification without bounce data', async () => {
  const result = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: 'test-no-bounce-001',
    Message: JSON.stringify({
      mail: { messageId: 'test-msg' }
      // No bounce object
    })
  });

  if (result.status !== 200) throw new Error(`Status ${result.status}`);
  if (!result.data.ok) throw new Error('Response failed');
  if (result.data.processed !== 0) throw new Error('Should not process any bounces');
  console.log('   Non-bounce notification handled gracefully');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTEST SUMMARY`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓\n');
  process.exit(0);
} else {
  console.log(`\n✗✗✗ ${failed} TEST(S) FAILED ✗✗✗\n`);
  process.exit(1);
}
