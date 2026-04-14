// ============================================================================
// EnginePool — lazy, per-project MaadEngine cache for multi-project routing
//
// First call to get(name) initializes the engine and scaffolds _skills/.
// Subsequent calls return the cached engine. evict(name) is a public seam
// for future policies (LRU/TTL) layered in 0.9.0; v1 never calls it from
// inside the pool.
// ============================================================================

import { MaadEngine } from '../engine/index.js';
import { ensureProjectSkills } from '../skills-scaffold.js';
import { ok, singleErr, type Result } from '../errors.js';
import type { InstanceConfig, ProjectConfig } from './config.js';
import { getProject } from './config.js';

export class EnginePool {
  private engines = new Map<string, MaadEngine>();
  private initPromises = new Map<string, Promise<Result<MaadEngine>>>();

  constructor(private instance: InstanceConfig) {}

  getInstance(): InstanceConfig {
    return this.instance;
  }

  listProjects(): ProjectConfig[] {
    return [...this.instance.projects];
  }

  has(name: string): boolean {
    return this.engines.has(name);
  }

  // Returns the cached engine or initializes it. Concurrent calls for the
  // same project await the same init promise so we don't double-init.
  async get(name: string): Promise<Result<MaadEngine>> {
    const cached = this.engines.get(name);
    if (cached) return ok(cached);

    const inFlight = this.initPromises.get(name);
    if (inFlight) return inFlight;

    const project = getProject(this.instance, name);
    if (!project) {
      return singleErr('PROJECT_UNKNOWN', `Project "${name}" is not declared in instance "${this.instance.name}"`);
    }

    const initPromise = this.initEngine(project);
    this.initPromises.set(name, initPromise);
    try {
      const result = await initPromise;
      if (result.ok) this.engines.set(name, result.value);
      return result;
    } finally {
      this.initPromises.delete(name);
    }
  }

  private async initEngine(project: ProjectConfig): Promise<Result<MaadEngine>> {
    const engine = new MaadEngine();
    const initResult = await engine.init(project.path);
    if (!initResult.ok) return initResult;
    ensureProjectSkills(project.path);
    return ok(engine);
  }

  // Public eviction seam. v1 never calls this internally — 0.9.0 can layer
  // LRU/TTL policy on top. Closes SQLite cleanly before removing.
  async evict(name: string): Promise<void> {
    const engine = this.engines.get(name);
    if (!engine) return;
    engine.close();
    this.engines.delete(name);
  }

  async closeAll(): Promise<void> {
    for (const [name, engine] of this.engines) {
      try {
        engine.close();
      } catch {
        // swallow — shutdown best-effort
      }
      this.engines.delete(name);
    }
  }
}
