import { describe, expect, it } from 'vitest';

import { Fmp4FragmentAssembler } from './fmp4-fragment-assembler.js';

describe('Fmp4FragmentAssembler', () => {
  it('passes through fragments delivered as a combined moof and mdat callback', () => {
    const assembler = new Fmp4FragmentAssembler();
    const fragment = Buffer.from('combined');

    expect(assembler.push(fragment, ['moof', 'mdat'])).toBe(fragment);
  });

  it('combines a split moof and mdat into one media fragment', () => {
    const assembler = new Fmp4FragmentAssembler();

    expect(assembler.push(Buffer.from('metadata'), ['moof'])).toBeUndefined();
    expect(assembler.push(Buffer.from('media'), ['mdat'])?.toString()).toBe('metadatamedia');
  });

  it('does not emit standalone init or media boxes', () => {
    const assembler = new Fmp4FragmentAssembler();

    expect(assembler.push(Buffer.from('init'), ['moov'])).toBeUndefined();
    expect(assembler.push(Buffer.from('orphan'), ['mdat'])).toBeUndefined();
  });

  it('replaces an incomplete fragment when the next moof arrives', () => {
    const assembler = new Fmp4FragmentAssembler();

    assembler.push(Buffer.from('stale'), ['moof']);
    assembler.push(Buffer.from('current'), ['moof']);

    expect(assembler.push(Buffer.from('media'), ['mdat'])?.toString()).toBe('currentmedia');
  });
});
