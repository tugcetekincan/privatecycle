import {
  MoodTag,
  cycleMoodTag,
  parseMoodTags,
  primaryMoodId,
  removeMoodTag,
  serializeMoodTags,
} from '@/services/MoodTags';

describe('parseMoodTags', () => {
  it('parses a valid tag list', () => {
    expect(parseMoodTags('[{"id":"anxious","level":2},{"id":"tired","level":1}]')).toEqual([
      { id: 'anxious', level: 2 },
      { id: 'tired', level: 1 },
    ]);
  });

  it('returns [] for empty, garbage or non-array values', () => {
    expect(parseMoodTags('')).toEqual([]);
    expect(parseMoodTags(null)).toEqual([]);
    expect(parseMoodTags(undefined)).toEqual([]);
    expect(parseMoodTags('not json')).toEqual([]);
    expect(parseMoodTags('{"id":"anxious"}')).toEqual([]);
  });

  it('clamps invalid levels and drops malformed entries', () => {
    expect(
      parseMoodTags('[{"id":"a","level":0},{"id":"b","level":9},{"id":"c"},{"level":2},{"id":""}]')
    ).toEqual([
      { id: 'a', level: 1 },
      { id: 'b', level: 3 },
      { id: 'c', level: 1 },
    ]);
  });

  it('drops duplicate ids, keeping the first', () => {
    expect(parseMoodTags('[{"id":"a","level":1},{"id":"a","level":3}]')).toEqual([
      { id: 'a', level: 1 },
    ]);
  });

  it('round-trips through serialize', () => {
    const tags: MoodTag[] = [{ id: 'calm', level: 3 }];
    expect(parseMoodTags(serializeMoodTags(tags))).toEqual(tags);
  });
});

describe('cycleMoodTag', () => {
  it('adds new tags at level 1', () => {
    expect(cycleMoodTag([], 'anxious')).toEqual([{ id: 'anxious', level: 1 }]);
  });

  it('bumps an existing tag and cycles 3 -> 1', () => {
    const level2 = cycleMoodTag([{ id: 'anxious', level: 1 }], 'anxious');
    expect(level2).toEqual([{ id: 'anxious', level: 2 }]);
    const level3 = cycleMoodTag(level2, 'anxious');
    expect(level3).toEqual([{ id: 'anxious', level: 3 }]);
    expect(cycleMoodTag(level3, 'anxious')).toEqual([{ id: 'anxious', level: 1 }]);
  });

  it('does not mutate the input', () => {
    const tags: MoodTag[] = [{ id: 'anxious', level: 1 }];
    cycleMoodTag(tags, 'anxious');
    expect(tags).toEqual([{ id: 'anxious', level: 1 }]);
  });
});

describe('removeMoodTag / primaryMoodId', () => {
  it('removes by id', () => {
    const tags: MoodTag[] = [
      { id: 'a', level: 1 },
      { id: 'b', level: 2 },
    ];
    expect(removeMoodTag(tags, 'a')).toEqual([{ id: 'b', level: 2 }]);
  });

  it('primary mood is the first tag, empty when there is none', () => {
    expect(primaryMoodId([{ id: 'calm', level: 1 }])).toBe('calm');
    expect(primaryMoodId([])).toBe('');
  });
});
