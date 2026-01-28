# Contributing to APEX Platform

We love your input! We want to make contributing to APEX Platform as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Getting Started (v7.0+ Modular Architecture)

1. Fork the repo and create your branch from `main`.
2. Install dependencies:
   ```bash
   npm install
   cd node && npm install
   ```
3. Start the development environment:
   ```bash
   # Terminal 1: Start backend
   cd node && npm start

   # Terminal 2: Start Vite dev server
   npm run dev
   ```
4. Access the application at `http://localhost:5173`

### Project Structure

```
/apex-platform
├── index.html              # Main application (legacy monolith)
├── package.json            # Root package with Vite
├── vite.config.js          # Vite configuration with API proxy
└── src/
    ├── main.js             # Module entry point
    ├── css/main.css        # Extracted CSS (4,471 lines)
    └── js/
        ├── api/client.js   # Centralized API client
        ├── core/           # Config, state management
        ├── ui/             # UI components (auth, notifications, modal)
        └── utils/          # Utility functions
```

### Development Guidelines

1. **New code should be ES Modules** - Add to `src/js/` directory
2. **Expose to window for legacy compatibility** - Update `src/main.js`
3. **Use feature flags** - Control rollout via `src/js/core/config.js`
4. **Follow the Strangler Fig pattern** - Gradually extract from index.html

### Pull Request Process

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Pull Request Process

1. Update the README.md with details of changes to the interface, this includes new environment 
   variables, exposed ports, useful file locations and container parameters.
2. Increase the version numbers in any examples files and the README.md to the new version that this
   Pull Request would represent.
3. You may merge the Pull Request in once you have the sign-off of two other developers, or if you 
   do not have permission to do that, you may request the second reviewer to merge it for you.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](https://github.com/yourusername/apex-platform/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/yourusername/apex-platform/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

People *love* thorough bug reports. I'm not even kidding.

## Use a Consistent Coding Style

* Use 4 spaces for indentation rather than tabs
* You can try running `npm run lint` for style unification

## License

By contributing, you agree that your contributions will be licensed under its MIT License.

## References

This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/a9316a723f9e918afde44dea68b5f9f39b7d9b00/CONTRIBUTING.md)