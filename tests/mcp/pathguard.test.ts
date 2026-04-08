import { describe, it, expect } from 'vitest';
import { isContainedIn, assertContainedIn } from '../../src/engine/pathguard.js';

describe('pathguard', () => {
  it('accepts paths inside root', () => {
    expect(isContainedIn('/project/clients/cli-acme.md', '/project')).toBe(true);
    expect(isContainedIn('/project/_registry/types.yaml', '/project')).toBe(true);
  });

  it('accepts root itself', () => {
    expect(isContainedIn('/project', '/project')).toBe(true);
  });

  it('rejects sibling paths', () => {
    expect(isContainedIn('/project-other/file.md', '/project')).toBe(false);
    expect(isContainedIn('/projectX/file.md', '/project')).toBe(false);
  });

  it('rejects parent traversal', () => {
    expect(isContainedIn('/project/../etc/passwd', '/project')).toBe(false);
    expect(isContainedIn('/project/../../secret', '/project')).toBe(false);
  });

  it('rejects absolute paths outside root', () => {
    expect(isContainedIn('/etc/passwd', '/project')).toBe(false);
    expect(isContainedIn('/tmp/file.md', '/project')).toBe(false);
  });

  it('assertContainedIn throws on escape', () => {
    expect(() => assertContainedIn('/other/file.md', '/project', 'test')).toThrow('Path escape rejected');
  });

  it('assertContainedIn does not throw when contained', () => {
    expect(() => assertContainedIn('/project/file.md', '/project', 'test')).not.toThrow();
  });
});
