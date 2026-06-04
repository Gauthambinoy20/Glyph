import os
from typing import List

GREETING = "hello"


@my_decorator
def decorated_func(x):
    return x + 1


def add(a, b):
    return a + b


class Calculator:
    def multiply(self, a, b):
        return a * b


if __name__ == "__main__":
    print(add(1, 2))
