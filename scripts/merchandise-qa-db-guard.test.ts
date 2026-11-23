import { describe, expect, test } from 'bun:test'
import { requireIsolatedMerchandiseQaDatabase, validateIsolatedMerchandiseQaUrl } from './merchandise-qa-db-guard'

describe('synthetic merchandise QA refuses unsafe database destinations before connecting', () => {
  const original = process.env.DATABASE_URL
  const rejected = [
    undefined,
    'file:/tmp/qa.db',
    'postgresql://user:password@production.example.com/ieventplux_qa?schema=ieventplux_merch_qa_20261119',
    'postgresql://user:password@127.0.0.1/ieventplux?schema=ieventplux_merch_qa_20261119',
    'postgresql://user:password@127.0.0.1/production_qa?schema=ieventplux_merch_qa_20261119',
    'postgresql://user:password@127.0.0.1/ieventplux_merch_qa_copy?schema=ieventplux_merch_qa_20261119',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=public',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&host=production.example.com',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&options=-c%20search_path%3Dpublic',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&schema=public',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&sslmode=disable',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&application_name=qa',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119&pgbouncer=true',
    'postgresql://user:password@127.0.0.1/ieventplux_qa?schema=ieventplux_merch_qa_20261119#ignored',

  ]
  test('accepts only the expected loopback QA database and schema URL', () => {
    try {
      for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
        process.env.DATABASE_URL = `postgresql://qa:qa@${host}:5432/ieventplux_merch_qa?schema=ieventplux_merch_qa_20261119`
        expect(validateIsolatedMerchandiseQaUrl).not.toThrow()
      }
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = original
    }
  })

  test('rejects missing, live, remote and connection-option bypass URLs', async () => {
    try {
      for (const url of rejected) {
        if (url === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = url
        expect(validateIsolatedMerchandiseQaUrl).toThrow()
        await expect(requireIsolatedMerchandiseQaDatabase()).rejects.toThrow()
      }
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = original
    }
  })
})
