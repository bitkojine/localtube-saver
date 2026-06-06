import test from 'node:test';
import assert from 'node:assert';
import { getExtractorArgs, classifyError } from './download';

test('getExtractorArgs: returns basic args with no tokens', () => {
  const args = getExtractorArgs('', '');
  assert.strictEqual(args, 'youtube:player-client=mweb,web;player-skip=webpage,configs');
});

test('getExtractorArgs: includes poToken when provided', () => {
  const args = getExtractorArgs('mytoken123', '');
  assert.ok(args.includes('po_token='));
  assert.ok(args.includes('mytoken123'));
});

test('getExtractorArgs: includes visitorData when provided', () => {
  const args = getExtractorArgs('', 'myvisitor');
  assert.ok(args.includes('visitor_data=myvisitor'));
});

test('getExtractorArgs: includes both tokens when provided', () => {
  const args = getExtractorArgs('po123', 'vd456');
  assert.ok(args.includes('po123'));
  assert.ok(args.includes('vd456'));
  assert.ok(args.includes('po_token='));
  assert.ok(args.includes('visitor_data=vd456'));
});

test('classifyError: detects FORMAT_ERROR', () => {
  assert.strictEqual(classifyError('Requested format is not available'), 'FORMAT_ERROR');
  assert.strictEqual(classifyError('format not available'), 'FORMAT_ERROR');
});

test('classifyError: detects NETWORK_ERROR', () => {
  assert.strictEqual(classifyError('Unable to download webpage'), 'NETWORK_ERROR');
  assert.strictEqual(classifyError('HTTP Error 403'), 'NETWORK_ERROR');
  assert.strictEqual(classifyError('network error'), 'NETWORK_ERROR');
});

test('classifyError: returns EXTRACTION_ERROR for unknown errors', () => {
  assert.strictEqual(classifyError('some random error'), 'EXTRACTION_ERROR');
  assert.strictEqual(classifyError(''), 'EXTRACTION_ERROR');
});
