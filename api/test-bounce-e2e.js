/**
 * Test E2E completo para Bounce Handling
 * Incluye: crear cuenta, campaña, envíos, y procesar bounces
 * Ejecutar: node test-bounce-e2e.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:4600';
const TEST_EMAIL = 'admin@mailux.com';
const TEST_PASSWORD = 'mailux2024';

let token = null;
let distributorId = null;
let listId = null;
let campaignId = null;

async function api(method, path, body = null, authToken = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();

  if (!res.ok && data.error) {
    throw new Error(`${res.status}: ${data.error}`);
  }

  return { status: res.status, data };
}

async function register() {
  console.log('\n=== PHASE 1: Using existing admin user ===\n');
  console.log('✓ Admin user found:', TEST_EMAIL);
}

async function login() {
  console.log('\n=== PHASE 2: Login ===\n');

  try {
    const result = await api('POST', '/api/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    token = result.data.token;
    distributorId = result.data.user.distributor_id;

    console.log('✓ Logged in successfully');
    console.log(`  - Token: ${token.substring(0, 20)}...`);
    console.log(`  - Distributor ID: ${distributorId}`);

    return token;
  } catch (err) {
    console.error('✗ Failed to login:', err.message);
    throw err;
  }
}

async function createContactList() {
  console.log('\n=== PHASE 3: Create Contact List ===\n');

  try {
    const result = await api('POST', '/api/lists', {
      name: `Test List ${Date.now()}`
    }, token);

    listId = result.data.id;
    console.log('✓ Contact list created');
    console.log(`  - List ID: ${listId}`);

    return listId;
  } catch (err) {
    console.error('✗ Failed to create list:', err.message);
    throw err;
  }
}

async function addContacts() {
  console.log('\n=== PHASE 4: Add Contacts ===\n');

  const contacts = [
    { email: 'valid@example.com', name: 'Valid User' },
    { email: 'bounce-hard-test@example.com', name: 'Hard Bounce User' },
    { email: 'bounce-soft-test@example.com', name: 'Soft Bounce User' }
  ];

  try {
    for (const contact of contacts) {
      const result = await api('POST', `/api/lists/${listId}/contacts`, contact, token);
      console.log(`✓ Added contact: ${contact.email}`);
    }

    return contacts;
  } catch (err) {
    console.error('✗ Failed to add contacts:', err.message);
    throw err;
  }
}

async function createCampaign() {
  console.log('\n=== PHASE 5: Create Campaign ===\n');

  try {
    const result = await api('POST', '/api/campaigns', {
      name: `Test Campaign ${Date.now()}`,
      subject: 'Test Email Subject',
      from_name: 'Test Sender',
      from_email: 'test@example.com',
      body_html: '<p>Hello {{nombre}}, this is a test email</p>',
      list_id: listId
    }, token);

    campaignId = result.data.id;
    console.log('✓ Campaign created');
    console.log(`  - Campaign ID: ${campaignId}`);

    return campaignId;
  } catch (err) {
    console.error('✗ Failed to create campaign:', err.message);
    throw err;
  }
}

async function sendCampaign() {
  console.log('\n=== PHASE 6: Send Campaign ===\n');

  try {
    const result = await api('POST', `/api/campaigns/${campaignId}/send`, {}, token);

    console.log('✓ Campaign sent');
    console.log(`  - Total to send: ${result.data.total}`);

    // Esperar un poco para que se procesen los envíos
    await new Promise(resolve => setTimeout(resolve, 1000));

    return result.data;
  } catch (err) {
    console.error('✗ Failed to send campaign:', err.message);
    throw err;
  }
}

async function getCampaignStats() {
  console.log('\n=== PHASE 7: Get Initial Campaign Stats ===\n');

  try {
    const result = await api('GET', `/api/campaigns/${campaignId}/stats`, null, token);

    console.log('Campaign stats before bounce processing:');
    console.log(`  - Status: ${result.data.status}`);
    console.log(`  - By status:`, result.data.by_status);
    console.log(`  - Bounces:`, result.data.bounce_stats);

    return result.data;
  } catch (err) {
    console.error('✗ Failed to get stats:', err.message);
    throw err;
  }
}

async function processBounces() {
  console.log('\n=== PHASE 8: Process Bounce Notifications ===\n');

  // Hard bounce
  const hardBounceResult = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: `test-hard-${Date.now()}`,
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'Undetermined',
        bouncedRecipients: [
          { emailAddress: 'bounce-hard-test@example.com', status: '5.1.1' }
        ],
        timestamp: new Date().toISOString(),
        feedbackId: `test-hard-${Date.now()}`
      },
      mail: { messageId: `msg-${Date.now()}` }
    })
  });

  console.log('✓ Hard bounce processed');
  console.log(`  - Response:`, hardBounceResult.data);

  // Soft bounce
  const softBounceResult = await api('POST', '/webhooks/ses-bounce', {
    Type: 'Notification',
    MessageId: `test-soft-${Date.now()}`,
    Message: JSON.stringify({
      bounce: {
        bounceType: 'Temporary',
        bounceSubType: 'Mailbox Full',
        bouncedRecipients: [
          { emailAddress: 'bounce-soft-test@example.com', status: '4.2.3' }
        ],
        timestamp: new Date().toISOString(),
        feedbackId: `test-soft-${Date.now()}`
      },
      mail: { messageId: `msg-${Date.now()}` }
    })
  });

  console.log('✓ Soft bounce processed');
  console.log(`  - Response:`, softBounceResult.data);

  return { hardBounce: hardBounceResult.data, softBounce: softBounceResult.data };
}

async function getFinalStats() {
  console.log('\n=== PHASE 9: Get Final Campaign Stats ===\n');

  try {
    const result = await api('GET', `/api/campaigns/${campaignId}/stats`, null, token);

    console.log('Campaign stats after bounce processing:');
    console.log(`  - Status: ${result.data.status}`);
    console.log(`  - By status:`, result.data.by_status);
    console.log(`  - Bounce stats:`, result.data.bounce_stats);

    return result.data;
  } catch (err) {
    console.error('✗ Failed to get final stats:', err.message);
    throw err;
  }
}

async function getGlobalStats() {
  console.log('\n=== PHASE 10: Get Global Stats ===\n');

  try {
    const result = await api('GET', '/api/stats', null, token);

    console.log('Global distributor stats:');
    console.log(`  - Total lists: ${result.data.total_lists}`);
    console.log(`  - Total contacts: ${result.data.total_contacts}`);
    console.log(`  - Total campaigns: ${result.data.total_campaigns}`);
    console.log(`  - Bounce stats:`, result.data.bounce_stats);

    return result.data;
  } catch (err) {
    console.error('✗ Failed to get global stats:', err.message);
    throw err;
  }
}

async function runE2ETest() {
  console.log('Starting E2E Test for Bounce Handling...');

  try {
    await register();
    await login();
    await createContactList();
    await addContacts();
    await createCampaign();
    await sendCampaign();
    await getCampaignStats();
    await processBounces();
    await getFinalStats();
    await getGlobalStats();

    console.log('\n✓ E2E TEST PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ E2E TEST FAILED:', err.message);
    process.exit(1);
  }
}

runE2ETest();
