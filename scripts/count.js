const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://dineshsuthar_db_user:o8gdfCvdnMaR3S2J@vkstlclustor.mj3fvmo.mongodb.net/vk4_prod?appName=whatsapp';
const dbName = 'vk4_prod';

async function getUniqueVisitorCount() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(dbName);
    
    // Replace with your actual event IDs
    const eventId1 = new ObjectId('6960288c8cc7001a826fc1f0');
    const eventId2 = new ObjectId('6960288c8cc7001a826fc1f1');
    
    // Get unique visitors for event 1
    const visitorsEvent1 = await db.collection('registrations')
      .distinct('visitor_id', { event_id: eventId1 });
    
    // Get unique visitors for event 2
    const visitorsEvent2 = await db.collection('registrations')
      .distinct('visitor_id', { event_id: eventId2 });
    
    // Convert to Sets for easier operations (convert ObjectIds to strings)
    const setA = new Set(visitorsEvent1.map(id => id.toString()));
    const setB = new Set(visitorsEvent2.map(id => id.toString()));
    
    // Find intersection
    const intersection = [...setA].filter(id => setB.has(id));
    
    // Calculate union using formula: |A| + |B| - |A ∩ B|
    const countA = setA.size;
    const countB = setB.size;
    const countIntersection = intersection.length;
    const countUnion = countA + countB - countIntersection;
    
    console.log(`Event 1 unique visitors: ${countA}`);
    console.log(`Event 2 unique visitors: ${countB}`);
    console.log(`Intersection count: ${countIntersection}`);
    console.log(`Union count (A + B - A∩B): ${countUnion}`);
    console.log('\nVisitors attending both sessions:');
    intersection.forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
    
    return countUnion;
    
  } finally {
    await client.close();
  }
}

getUniqueVisitorCount().catch(console.error);