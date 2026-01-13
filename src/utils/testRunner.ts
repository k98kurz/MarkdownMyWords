export interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration?: number
}

export interface TestSuiteResult {
  suiteName: string
  tests: TestResult[]
  passed: number
  failed: number
}

export class TestRunner {
  private suiteName: string
  private tests: TestResult[] = []

  constructor(suiteName: string) {
    this.suiteName = suiteName
  }

  async run(testName: string, testFn: () => Promise<void> | void): Promise<void> {
    const startTime = performance.now()
    try {
      await testFn()
      const duration = performance.now() - startTime
      this.tests.push({ name: testName, passed: true, duration })
      console.log(`  ✅ ${testName} (${Math.round(duration)}ms)`)
    } catch (error) {
      const duration = performance.now() - startTime
      let errorMessage = ''
      try {
        errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      } catch {
        errorMessage = String(error)
      }
      this.tests.push({ name: testName, passed: false, error: errorMessage, duration })
      console.log(
        `  ❌ ${testName}${errorMessage ? ` - ${errorMessage}` : ''} (${Math.round(duration)}ms)`
      )
    }
  }

  getResults(): TestSuiteResult {
    const passed = this.tests.filter(r => r.passed).length
    const failed = this.tests.filter(r => !r.passed).length
    return { suiteName: this.suiteName, tests: this.tests, passed, failed }
  }

  printResults(): void {
    const results = this.getResults()
    console.log(`\n${results.suiteName}: ${results.passed}/${results.tests.length} passed`)
    if (results.failed > 0) {
      const failedTests = results.tests.filter(t => !t.passed)
      for (const test of failedTests) {
        console.log(`   ❌ ${test.name}${test.error ? ` - ${test.error}` : ''}`)
      }
    }
  }
}

export function printTestSummary(suiteResults: TestSuiteResult[]): void {
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(60))

  let totalTests = 0
  let totalPassed = 0
  let totalFailed = 0

  for (const suite of suiteResults) {
    const suiteTotal = suite.tests.length
    const suitePassed = suite.passed
    const suiteFailed = suite.failed
    totalTests += suiteTotal
    totalPassed += suitePassed
    totalFailed += suiteFailed

    const status = suiteFailed === 0 ? '✅' : '❌'
    console.log(`\n${status} ${suite.suiteName}: ${suitePassed}/${suiteTotal} passed`)

    if (suiteFailed > 0) {
      const failedTests = suite.tests.filter(t => !t.passed)
      for (const test of failedTests) {
        console.log(`   ❌ ${test.name}${test.error ? ` - ${test.error}` : ''}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  const overallStatus = totalFailed === 0 ? '✅' : '❌'
  console.log(`${overallStatus} OVERALL: ${totalPassed}/${totalTests} tests passed`)
  if (totalFailed > 0) {
    console.log(`   ${totalFailed} test(s) failed`)
  }
  console.log('='.repeat(60))
}
