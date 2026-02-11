# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (output in `dist/`)
- `npm run preview` - Preview production build locally

## Architecture

This is a vanilla JavaScript application using Vite as the build tool. No framework.

- `index.html` - Entry point, mounts the app to `#app`
- `src/main.js` - Application bootstrap, renders initial DOM
- `src/style.css` - Global styles with light/dark theme support
