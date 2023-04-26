/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { schema } from '@kbn/config-schema';
import { Logger, IRouter } from '@kbn/core/server';
import { createSession, Session } from '../lib/session';
import { startProfiling } from '../lib/heap_profile';
import { createDeferred } from '../lib/deferred';

const routeValidation = {
  query: schema.object({
    duration: schema.number({ defaultValue: 5 }),
    // average sample interval in bytes
    interval: schema.number({ defaultValue: 32768 }),
    includeMajorGC: schema.boolean({ defaultValue: false }),
    includeMinorGC: schema.boolean({ defaultValue: false }),
  }),
};

const routeConfig = {
  path: '/_dev/heap_profile',
  validate: routeValidation,
};

export function registerRoute(logger: Logger, router: IRouter): void {
  router.get(routeConfig, async (context, request, response) => {
    const { duration, interval, includeMajorGC, includeMinorGC } = request.query;

    let session: Session;
    try {
      session = await createSession(logger);
    } catch (err) {
      const message = `unable to create session: ${err.message}`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    logger.info(
      `starting heap profile with duration ${duration}s, interval ${interval} bytes, includeMajorGC ${includeMajorGC}, includeMinorGC ${includeMinorGC}`
    );
    const deferred = createDeferred();
    let stopProfiling: any;
    try {
      stopProfiling = await startProfiling(session, {
        samplingInterval: interval,
        includeObjectsCollectedByMajorGC: includeMajorGC,
        includeObjectsCollectedByMinorGC: includeMinorGC,
      });
    } catch (err) {
      const message = `unable to start heap profiling: ${err.message}`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    setTimeout(whenDone, 1000 * request.query.duration);

    let profile;
    async function whenDone() {
      try {
        profile = await stopProfiling();
      } catch (err) {
        logger.warn(`unable to capture heap profile: ${err.message}`);
      }
      deferred.resolve();
    }

    await deferred.promise;

    try {
      await session.destroy();
    } catch (err) {
      logger.warn(`unable to destroy session: ${err.message}`);
    }

    if (profile == null) {
      const message = `unable to capture heap profile`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    const fileName = new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/\//g, '-')
      .replace(/:/g, '-')
      .substring(5, 19);

    return response.ok({
      body: profile,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}.heapprofile"`,
      },
    });
  });
}
