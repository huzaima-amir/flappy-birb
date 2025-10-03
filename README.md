# Assignment 1 FIT2099 
# Flappy Birb

## Features and Overview
This game is inspired by *Flappy Bird*, and coded in typescript with a functional reactive programming approach using RxJS Observable streams.

- **Gravity and Flap Mechanics**: The bird continuously falls and flaps upward when the spacebar is pressed.

- **Scrolling Pipes**: Pipes with vertical gaps move from right to left, based on timing and position data from a CSV file.

- **Collision and Bounce Logic**: On collision with pipes or screen edges, the bird loses a life and bounces with randomized velocity.

- **Life System**: The bird starts with 3 lives; the game ends when all lives are lost or all pipes are passed.

- **Score Tracking**: Score increases when the bird successfully passes through a pipe.

- **Game Restart**: After game over, the player can restart the game session.
## Usage

Setup (requires node.js):

```bash
> npm install
```

Start tests:

```bash
> npm test
```
