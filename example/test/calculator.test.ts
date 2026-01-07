import { add, multiply, subtract } from '../src/calculator';

test('add function', () => {
  expect(add(2, 3)).toBe(5);
  expect(add(-2, -3)).toBe(-5);
});

test('multiply function', () => {
  expect(multiply(2, 3)).toBe(6);
  expect(multiply(0, 5)).toBe(0);
  expect(multiply(-2, 4)).toBe(-8);
  expect(multiply(2, 0)).toBe(0);
  expect(multiply(-3, -3)).toBe(9);
});

test('subtract function', () => {
  expect(subtract(5, 3)).toBe(2);
  expect(subtract(0, 1)).toBe(-1);
});
