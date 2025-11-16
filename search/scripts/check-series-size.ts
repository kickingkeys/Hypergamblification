#!/usr/bin/env tsx
import 'dotenv/config';
import { KalshiClient } from '../src/indexer/kalshi-client.js';

async function main() {
  const client = new KalshiClient();

  console.log('📊 Fetching ALL series data to calculate memory footprint...\n');
  const response = await client.getSeries();
  const series = response.series || [];

  console.log(`✅ Total series: ${series.length}\n`);

  // Sample first series
  if (series.length > 0) {
    console.log('📄 Sample series object:');
    console.log(JSON.stringify(series[0], null, 2));
    console.log('\n' + '='.repeat(60) + '\n');
  }

  // Calculate memory footprint
  const jsonString = JSON.stringify(series);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
  const sizeInKB = (sizeInBytes / 1024).toFixed(2);
  const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);

  console.log('💾 Memory footprint:');
  console.log(`  Total bytes: ${sizeInBytes.toLocaleString('en-US')}`);
  console.log(`  Size in KB: ${sizeInKB} KB`);
  console.log(`  Size in MB: ${sizeInMB} MB`);
  console.log(`  Per series: ~${(sizeInBytes / series.length).toFixed(0)} bytes`);
  console.log(`  Node.js heap estimate: ~${(sizeInBytes * 2 / 1024 / 1024).toFixed(2)} MB (with overhead)\n`);

  // Check what fields are available
  if (series.length > 0) {
    const fields = Object.keys(series[0]);
    console.log(`🔍 Fields per series (${fields.length} total):\n  ${fields.join(', ')}\n`);

    // Check which fields have data
    console.log('📈 Field coverage:');
    fields.forEach(field => {
      const populated = series.filter((s: any) => s[field] != null && s[field] !== '').length;
      const percentage = ((populated / series.length) * 100).toFixed(1);
      console.log(`  ${field.padEnd(20)}: ${percentage.padStart(5)}% populated (${populated}/${series.length})`);
    });
  }

  // Check for tags (critical for search!)
  console.log('\n🏷️  Tags analysis:');
  const seriesWithTags = series.filter((s: any) => s.tags && s.tags.length > 0);
  console.log(`  Series with tags: ${seriesWithTags.length} (${((seriesWithTags.length / series.length) * 100).toFixed(1)}%)`);

  if (seriesWithTags.length > 0) {
    console.log(`  Sample tags: ${JSON.stringify(seriesWithTags[0].tags)}`);

    // Count total unique tags
    const allTags = new Set();
    seriesWithTags.forEach((s: any) => {
      if (s.tags) {
        s.tags.forEach((tag: string) => allTags.add(tag));
      }
    });
    console.log(`  Unique tags across all series: ${allTags.size}`);

    // Average tags per series
    const totalTagCount = seriesWithTags.reduce((sum: number, s: any) => sum + (s.tags?.length || 0), 0);
    console.log(`  Average tags per series: ${(totalTagCount / seriesWithTags.length).toFixed(1)}`);
  }

  // Check string field lengths (for search index size estimation)
  console.log('\n📏 Average text field lengths:');
  const textFields = ['title', 'category'];
  textFields.forEach(field => {
    const lengths = series
      .filter((s: any) => s[field])
      .map((s: any) => s[field].length);

    if (lengths.length > 0) {
      const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
      const maxLength = Math.max(...lengths);
      console.log(`  ${field.padEnd(15)}: avg=${avgLength.toFixed(1)} chars, max=${maxLength} chars`);
    }
  });

  // Conclusion
  console.log('\n' + '='.repeat(60));
  console.log('💡 CONCLUSION:');
  console.log('='.repeat(60));

  if (parseFloat(sizeInMB) < 10) {
    console.log('✅ Series data is TINY! Perfect for in-memory storage!');
    console.log(`✅ Total memory: ${sizeInMB} MB (< 10 MB)`);
    console.log('✅ Can easily fit in memory, even on small instances');
    console.log('✅ Consider: Load on startup, no database needed!');
  } else {
    console.log('⚠️  Series data might be too large for in-memory');
    console.log(`⚠️  Total memory: ${sizeInMB} MB`);
    console.log('💡 Consider using PostgreSQL for better scalability');
  }
}

main().catch(console.error);
