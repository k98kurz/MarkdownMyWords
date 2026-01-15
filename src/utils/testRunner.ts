export interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration?: number
}

export interface TaskResult {
  name: string
  success: boolean
  error?: string
  duration?: number
}

export interface TestSuiteResult {
  suiteName: string
  tests: TestResult[]
  tasks: TaskResult[]
  passed: number
  failed: number
  taskSuccesses: number
  taskFailures: number
}

export class TestRunner {
  private suiteName: string
  private tests: TestResult[] = []
  private tasks: TaskResult[] = []

  constructor(suiteName: string) {
    this.suiteName = suiteName
  }

  async run(testName: string, testFn: () => Promise<void> | void): Promise<void> {
    console.log(`beginning test ${testName}`)
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
      console.log(
        `  ❌ ${testName}${errorMessage ? ` - ${errorMessage}` : ''} (${Math.round(duration)}ms)`
      )
      this.tests.push({ name: testName, passed: false, error: errorMessage, duration })
    }
  }

  async task(taskName: string, taskFn: () => Promise<void> | void): Promise<void> {
    console.log(`beginning task ${taskName}`)
    const startTime = performance.now()
    try {
      await taskFn()
      const duration = performance.now() - startTime
      this.tasks.push({ name: taskName, success: true, duration })
      console.log(`  ✅ ${taskName} (${Math.round(duration)}ms)`)
    } catch (error) {
      const duration = performance.now() - startTime
      let errorMessage = ''
      try {
        errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      } catch {
        errorMessage = String(error)
      }
      this.tasks.push({ name: taskName, success: false, error: errorMessage, duration })
      console.log(
        `  ❌ ${taskName}${errorMessage ? ` - ${errorMessage}` : ''} (${Math.round(duration)}ms)`
      )
    }
  }

  getResults(): TestSuiteResult {
    const passed = this.tests.filter(r => r.passed).length
    const failed = this.tests.filter(r => !r.passed).length
    const taskSuccesses = this.tasks.filter(r => r.success).length
    const taskFailures = this.tasks.filter(r => !r.success).length
    return {
      suiteName: this.suiteName, tests: this.tests, tasks: this.tasks,
      passed, failed, taskSuccesses, taskFailures
    }
  }

  printResults(): void {
    const results = this.getResults()
    console.log(
      `\n${results.suiteName}: ${results.passed}/${results.tests.length} passed`
    )
    if (results.tasks.length) {
      console.log(
        `\n${results.suiteName} tasks: ` +
        `${results.taskSuccesses}/${results.tasks.length} succeeded`
      )
    }
    if (results.failed > 0) {
      const failedTests = results.tests.filter(t => !t.passed)
      for (const test of failedTests) {
        console.log(`   ❌ ${test.name}${test.error ? ` - ${test.error}` : ''}`)
      }
    }
    if (results.taskFailures > 0) {
      const failedTasks = results.tasks.filter(t => !t.success)
      for (const task of failedTasks) {
        console.log(`   ❌ ${task.name}${task.error ? ` - ${task.error}` : ''}`)
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
  let totalTasks = 0
  let totalTaskSuccesses = 0

  for (const suite of suiteResults) {
    const suiteTotal = suite.tests.length
    const suitePassed = suite.passed
    const suiteFailed = suite.failed
    const suiteTaskTotal = suite.tasks.length
    const suiteTaskSuccesses = suite.taskSuccesses
    totalTests += suiteTotal
    totalPassed += suitePassed
    totalFailed += suiteFailed
    totalTasks += suiteTaskTotal
    totalTaskSuccesses += suiteTaskSuccesses

    const status = suiteFailed === 0 ? '✅' : '❌'
    console.log(`\n${status} ${suite.suiteName}: ${suitePassed}/${suiteTotal} passed`)

    const taskStatus = suiteTaskTotal === suiteTaskSuccesses ? '✅' : '❌'
    if (suiteTaskTotal) {
      console.log(
        `\n${taskStatus} ${suite.suiteName}: ` +
        `${suiteTaskSuccesses}/${suiteTaskTotal} passed`
      )
    }

    if (suiteFailed > 0) {
      const failedTests = suite.tests.filter(t => !t.passed)
      for (const test of failedTests) {
        console.log(`   ❌ ${test.name}${test.error ? ` - ${test.error}` : ''}`)
      }
    }

    if (suiteTaskSuccesses < suiteTaskTotal) {
      const failedTasks = suite.tasks.filter(t => !t.success)
      for (const task of failedTasks) {
        console.log(`   ❌ ${task.name}${task.error ? ` - ${task.error}` : ''}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  const overallStatus = totalFailed === 0 ? '✅' : '❌'
  console.log(`${overallStatus} OVERALL: ${totalPassed}/${totalTests} tests passed`)
  if (totalFailed > 0) {
    console.log(`   ${totalFailed} test(s) failed`)
  }
  if (totalTasks > totalTaskSuccesses) {
    console.log(`   ${totalTasks - totalTaskSuccesses} task(s) failed`)
  }
  console.log('='.repeat(60))
}

export async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}
