// Imported only by fixture CLI tests. Any accidental remote GET/POST fails.
globalThis.fetch = async () => { throw new Error('fixture CLI forbids all remote network'); };
