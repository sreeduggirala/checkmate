# Checkmate Usage Examples

This file contains real-world example requests you can try with the Checkmate dual-agent system.

## Basic Feature Additions

### Example 1: Add Modulo Operation
**Request:**
```
Add a modulo operation to the calculator with tests
```

**What Checkmate Will Do:**
- Builder adds `modulo(a: number, b: number): number` method
- Creates tests for normal modulo operations
- Reviewer asks: "What about modulo by zero?"
- Builder handles edge case
- Cycle completes with robust implementation

**Expected Iterations:** 1-2

---

### Example 2: Add Power/Exponent Function
**Request:**
```
Add a power function that raises a number to an exponent
```

**What Checkmate Will Do:**
- Builder implements `power(base: number, exponent: number)`
- Reviewer flags: "Missing tests for negative exponents, zero exponent, fractional exponents"
- Builder adds comprehensive tests
- Final implementation handles all cases

**Expected Iterations:** 2

---

## Edge Case Validation

### Example 3: NaN Input Validation
**Request:**
```
Add validation to all calculator methods to reject NaN inputs and throw descriptive errors
```

**What Checkmate Will Do:**
- Builder adds `if (isNaN(a) || isNaN(b))` checks to all methods
- Reviewer verifies all methods are covered
- Tests added for NaN inputs on each operation
- Demonstrates thorough edge case coverage

**Expected Iterations:** 1-2

---

### Example 4: Infinity Handling
**Request:**
```
Make the calculator handle Infinity values gracefully
```

**What Checkmate Will Do:**
- Builder adds Infinity checks
- Reviewer asks for specific behavior: Should Infinity throw errors or return Infinity?
- May trigger Arbiter mode if there's disagreement on behavior
- Demonstrates decision-making process

**Expected Iterations:** 2-3

---

## Security-Focused Examples

### Example 5: Expression Evaluation (Security Test)
**Request:**
```
Add a method to evaluate mathematical expressions from strings
```

**What Checkmate Will Do:**
- Builder might initially try `eval()` or `Function()` constructor
- **Reviewer BLOCKS:** "CRITICAL SECURITY ISSUE: eval() can execute arbitrary code!"
- Builder must use a safe math parser library or implement safe parsing
- Demonstrates security-paranoid reviewer personality

**Expected Iterations:** 2-3
**Key Learning:** See how Reviewer catches dangerous patterns

---

## Complex Features

### Example 6: Factorial with Memoization
**Request:**
```
Add a factorial function with memoization for performance
```

**What Checkmate Will Do:**
- Builder implements factorial with memoization cache
- Reviewer checks: "What about negative numbers? What about large numbers causing overflow?"
- Tests for edge cases, performance, and correctness
- Demonstrates handling of algorithmic complexity

**Expected Iterations:** 2-3

---

### Example 7: Statistical Functions
**Request:**
```
Add methods to calculate mean, median, and mode of an array of numbers
```

**What Checkmate Will Do:**
- Builder creates three statistical methods
- Reviewer asks: "What about empty arrays? What about arrays with one element?"
- Tests cover edge cases: empty, single element, even/odd length, duplicates
- Shows multi-method implementation with comprehensive testing

**Expected Iterations:** 2-3

---

## Refactoring & Code Quality

### Example 8: Input Validation Refactoring
**Request:**
```
Refactor the calculator to use a shared input validation method to reduce duplication
```

**What Checkmate Will Do:**
- Builder creates `private validateInputs(a: number, b?: number)` helper
- Refactors all methods to use shared validation
- Reviewer ensures: no functionality changes, all tests still pass
- Demonstrates test-first refactoring

**Expected Iterations:** 1-2

---

### Example 9: Error Handling Improvement
**Request:**
```
Create a custom CalculatorError class and use it throughout the calculator
```

**What Checkmate Will Do:**
- Builder creates custom error class with error codes
- Updates all error throws to use CalculatorError
- Tests updated to check error types
- Demonstrates architectural improvements

**Expected Iterations:** 2

---

## Testing the Arbiter Mode

### Example 10: Trigger Arbiter Mode
**Request:**
```
Add a method to round numbers to a specified number of decimal places
```

**Then, if Reviewer keeps flagging the same issue:**
- Reviewer: "Doesn't handle rounding 0.1 + 0.2 correctly due to floating point"
- Builder: "It works fine"
- Reviewer (again): "Still concerned about floating point precision"
- **ARBITER MODE TRIGGERED**
- Builder forced to write test demonstrating the issue
- Test outcome decides who was right

**Expected Iterations:** 3 (to trigger arbiter)

---

## Expected Behaviors

### Builder Traits You'll See:
- ✅ Minimal patches (only changes what's necessary)
- ✅ Test-first approach (writes tests with implementation)
- ✅ Conservative (no unnecessary dependencies)
- ✅ Honest about risks (lists potential issues)

### Reviewer Traits You'll See:
- 🔍 Paranoid about edge cases (null, undefined, NaN, Infinity, empty, huge values)
- 🔍 Security-focused (flags injection, unsafe operations)
- 🔍 Test coverage obsessed (demands tests for all branches)
- 🔍 Pedantic about reproducibility (every issue must have verification steps)

### Orchestration Behaviors:
- 🔄 Event-driven flow (adapts to test results and verdicts)
- 🔄 Arbiter mode (forces concrete test demonstrations)
- 🔄 Oscillation detection (stops infinite loops)
- 🔄 Diagnostic mode (runs commands when uncertain)

---

## Tips for Testing

1. **Start Simple:** Try basic additions first to see the flow
2. **Then Security:** Try expression evaluation to see security checks
3. **Then Edge Cases:** Try NaN/Infinity handling to see thoroughness
4. **Then Complex:** Try statistical functions to see multi-method coordination

5. **Watch the Verdicts:**
   - `approve` = done
   - `request_changes` = fixable issues
   - `block` with `definite_bug` = critical problem
   - `block` with `uncertainty` = needs diagnostics
   - `block` with `needs_human` = design decision required

6. **Experiment with Config:**
   - Set `max_iterations: 5` for complex features
   - Try `review_strictness: "lenient"` vs `"strict"`
   - Enable `enable_moderator: true` to see tie-breaking

---

Enjoy exploring the dual-agent architecture! 🚀
