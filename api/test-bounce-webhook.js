/**
 * Test E2E para Bounce Handling - Webhook SNS
 * Ejecutar: npm run test-bounce
 */

import fetch from 'node-fetch';
import { createServer } from 'http';

// Esperar a que el servidor esté listo
async function waitForServer(port = 4600, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) {
        console.log('✓ Server is ready');
        return true;
      }
    } catch (err) {
      if (i < maxAttempts - 1) {
        console.log(`Waiting for server... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  throw new Error('Server did not start');
}

/**
 * Test: Enviar webhook de hard bounce desde SNS
 */
async function testHardBounce() {
  console.log('\n=== Test 1: Hard Bounce via SNS ===\n');

  const snsMessage = {
    Type: 'Notification',
    MessageId: 'test-msg-hard-001',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:mailux-bounces',
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'Undetermined',
        bouncedRecipients: [
          { emailAddress: 'hardbounce@example.com', status: '5.1.1', diagnosticCode: 'smtp; 550 5.1.1 user unknown' }
        ],
        timestamp: new Date().toISOString(),
        feedbackId: 'test-fb-001',
        remoteMtaIp: '192.0.2.1'
      },
      mail: {
        timestamp: new Date().toISOString(),
        source: 'sender@example.com',
        sourceArn: 'arn:aws:ses:us-east-1:123456789:identity/example.com',
        sendingAccountId: '123456789',
        messageId: 'test-msg-001',
        destination: ['hardBounce@example.com']
      }
    })
  };

  try {
    const response = await fetch('http://localhost:4600/webhooks/ses-bounce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snsMessage)
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.ok && result.results[0].bounceStatus === 'hard') {
      console.log('✓ Hard bounce processed correctly');
      return true;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  return false;
}

/**
 * Test: Enviar webhook de soft bounce desde SNS
 */
async function testSoftBounce() {
  console.log('\n=== Test 2: Soft Bounce via SNS ===\n');

  const snsMessage = {
    Type: 'Notification',
    MessageId: 'test-msg-soft-001',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:mailux-bounces',
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Temporary',
        bounceSubType: 'Mailbox Full',
        bouncedRecipients: [
          { emailAddress: 'softbounce@example.com', status: '4.2.3', diagnosticCode: 'smtp; 450 4.2.3 mailbox full' }
        ],
        timestamp: new Date().toISOString(),
        feedbackId: 'test-fb-002',
        remoteMtaIp: '192.0.2.2'
      },
      mail: {
        timestamp: new Date().toISOString(),
        source: 'sender@example.com',
        sourceArn: 'arn:aws:ses:us-east-1:123456789:identity/example.com',
        sendingAccountId: '123456789',
        messageId: 'test-msg-002',
        destination: ['softbounce@example.com']
      }
    })
  };

  try {
    const response = await fetch('http://localhost:4600/webhooks/ses-bounce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snsMessage)
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.ok && result.results[0].bounceStatus === 'soft') {
      console.log('✓ Soft bounce processed correctly');
      return true;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  return false;
}

/**
 * Test: SNS Subscribe confirmation
 */
async function testSNSSubscription() {
  console.log('\n=== Test 3: SNS Subscription Confirmation ===\n');

  const snsSubscribe = {
    Type: 'SubscriptionConfirmation',
    MessageId: 'test-subscribe-001',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:mailux-bounces',
    SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&...'
  };

  try {
    const response = await fetch('http://localhost:4600/webhooks/ses-bounce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snsSubscribe)
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log('✓ SNS subscription confirmation handled');
      return true;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  return false;
}

/**
 * Test: Multi-recipient bounce
 */
async function testMultiRecipientBounce() {
  console.log('\n=== Test 4: Multi-Recipient Bounce ===\n');

  const snsMessage = {
    Type: 'Notification',
    MessageId: 'test-msg-batch-001',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:mailux-bounces',
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'Undetermined',
        bouncedRecipients: [
          { emailAddress: 'invalid1@example.com', status: '5.1.1' },
          { emailAddress: 'invalid2@example.com', status: '5.1.1' },
          { emailAddress: 'invalid3@example.com', status: '5.1.1' }
        ],
        timestamp: new Date().toISOString(),
        feedbackId: 'test-fb-batch',
        remoteMtaIp: '192.0.2.3'
      },
      mail: {
        timestamp: new Date().toISOString(),
        source: 'sender@example.com',
        messageId: 'test-msg-batch'
      }
    })
  };

  try {
    const response = await fetch('http://localhost:4600/webhooks/ses-bounce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snsMessage)
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.ok && result.totalProcessed === 3) {
      console.log('✓ Multi-recipient bounce processed correctly');
      return true;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  return false;
}

// Main
async function runTests() {
  console.log('Starting webhook tests...\n');

  try {
    await waitForServer();

    const results = [];
    results.push(await testHardBounce());
    results.push(await testSoftBounce());
    results.push(await testSNSSubscription());
    results.push(await testMultiRecipientBounce());

    console.log('\n=== TEST SUMMARY ===');
    const passed = results.filter(r => r).length;
    console.log(`Passed: ${passed}/${results.length}`);

    if (passed === results.length) {
      console.log('✓ All tests passed!');
      process.exit(0);
    } else {
      console.log('✗ Some tests failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

runTests();
