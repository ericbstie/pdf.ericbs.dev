---
name: minimal-increment
description: Enforces minimal-scope, incremental coding work. Use before making any code changes.
---

Always use a TODO list (if available as a tool) and update the TODO list continuously when using this skill.

# Incremental work

Code is malleable. Mold the code through multiple iterations instead of one-shotting.
Leave openings for pivots when unexpected outcomes arise.

## What does this really mean?

When given a goal, break it down to the tiniest possible steps. Implement any small verifiable change, even if it's a change that will be rewritten later.
Define function signatures that you would like to exist (ref function-design skill), then stub them and test the logic you just implemented independently before proceeding to the next step.

## Example - LZ compression task (incremental changes with stubbed functions)

```py
print("Hello world")
```

```py
import argparse

if __name__ == "__main__":
    description = "Compresses/decompresses a file using the " \
                  "Lempel Ziv (LZ) compression algorithm."
    arg_parser = argparse.ArgumentParser(description=description)
    arg_parser.add_argument("-d", "--decompress", action="store_true")
    arg_parser.add_argument("input_file_name", metavar="input-file")
    arg_parser.add_argument("output_file_name",
                            nargs="?",
                            metavar="output-file",
                            default="output.txt")
    args = arg_parser.parse_args()
    print(args)
```

```py
import argparse


def lz_decompress_bytes(input_data: bytes) -> bytes:
    print("Hello from decompress!")
    return b""


def lz_compress_bytes(input_data: bytes) -> bytes:
    print("Hello from compress!")
    return b""


if __name__ == "__main__":
    description = "Compresses/decompresses a file using the " \
                  "Lempel Ziv (LZ) compression algorithm."
    arg_parser = argparse.ArgumentParser(description=description)
    arg_parser.add_argument("-d", "--decompress", action="store_true")
    arg_parser.add_argument("input_file_name", metavar="input-file")
    arg_parser.add_argument("output_file_name",
                            nargs="?",
                            metavar="output-file",
                            default="output.txt")
    args = arg_parser.parse_args()

    input_data: bytes = b""
    with open(args.input_file_name, "rb") as file:
        input_data = file.read()
    
    output_data: bytes = b""
    if args.decompress:
        print(f"Decompressing {args.input_file_name}", end=" ")
        print(f"to {args.output_file_name}")
        output = lz_decompress(input_data)
    else:
        print(f"Compressing {args.input_file_name}", end=" ")
        print(f"to {args.output_file_name}")
        output = lz_compress(input_data)

    with open(args.output_file_name, "wb") as file:
        file.write(output)
```

# Example conversation - Write an optimised two-sum implementation

"I'll start with an easy solution I know works"

```
def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
```

"Let me verify this works..."
*run tests*
"This works because ... However, it's not optimal because ... I'm sure we can get it smaller by using X... Approach Y might be another solution, but I'll try X first."

```
def twoSum(nums, target):
    nums = sorted((num, i) for i, num in enumerate(nums))

    left = 0
    right = len(nums) - 1

    while left < right:
        total = nums[left][0] + nums[right][0]

        if total == target:
            return [nums[left][1], nums[right][1]]
        elif total < target:
            left += 1
        else:
            right -= 1
```

"Let me verify this works..."
*run tests*
"Good! However, let's try approach Y now. It might be better because ..."

```
def twoSum(nums, target):
    seen = {}

    for i, num in enumerate(nums):
        needed = target - num

        if needed in seen:
            return [seen[needed], i]

        seen[num] = i
```

# Minimal changes

Every *surviving* line of code is a liability. Use intermediary steps to flesh out what's needed and what is not.
Scope down every task to the smallest changes based on what the user explicitly asked for. 
Anything "good to have" or that should implemented as part of another change should instead be given as a suggestion to the user.
Only explicit choices are implemented.

# Other

You may also want to use software engineering ideas behind the methodologies "spike", "walking skeleton", "vertical slices", "tracer-bullet", etc. to assist with this process if the changes are large.
