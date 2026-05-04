<div align="center">

<!-- <img src="public/assets/images/banner.png" alt="Skill Tracker Banner" width="100%"> -->

# 🚀 Skill Tracker

**The ultimate minimalist cockpit for mastering your craft.**

[![Angular](https://img.shields.io/badge/Angular-21.x-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

[Explore Features](#-key-features) • [Getting Started](#-getting-started) • [Tech Stack](#-tech-stack) • [Contributing](#-contributing)

</div>

## 🌟 Overview

Skill Tracker is a high-performance, aesthetically pleasing productivity application designed for deep work and skill mastery. Built with **Angular**, **Tailwind CSS**, and **Supabase**, it provides a "Calm Tech" interface that helps you track your progress without the noise.

Whether you're learning a new programming language, mastering an instrument, or prepping for exams, Skill Tracker gives you the tools to stay consistent and visualize your growth.

---

## ✨ Key Features

### 📅 Visual Mastery Heatmap
Track your consistency with a GitHub-style activity heatmap. Visualize your daily effort and maintain long-term streaks to build unbreakable habits.

### 🍅 Integrated Pomodoro Engine
Focus is your superpower. Use the built-in Pomodoro timer to manage deep work sessions and ensure high-quality learning.

### 🏛️ Hierarchical Tracking
Organize your learning journey with precision:
- **Subjects**: The broad categories (e.g., Computer Science, UI Design).
- **Topics**: Major milestones within a subject.
- **Subtopics**: Granular tasks and concepts to conquer.

### 📊 Weekly Insights
Review your performance over time with the weekly view. Understand your patterns and optimize your schedule for maximum efficiency.

### 🌓 Premium Aesthetic
Experience a "Deep Slate" design system featuring glassmorphism, spotlight hover effects, and smooth micro-animations.

---

## 🛠️ Tech Stack

- **Framework**: [Angular 21](https://angular.io/) (Latest Signals-based architecture)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with a custom design system
- **Backend/DB**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Realtime)
- **State Management**: Angular Signals & RxJS
- **Icons**: [Lucide Icons](https://lucide.dev/)
- **Animations**: CSS3 Transitions & Keyframes

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Angular CLI](https://angular.dev/tools/cli)
- A [Supabase](https://supabase.com/) project

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/Skill-Tracker.git
   cd Skill-Tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `src/environments/environment.ts` file and add your Supabase credentials:
   ```typescript
   export const environment = {
     production: false,
     supabaseUrl: 'YOUR_SUPABASE_URL',
     supabaseKey: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```

4. **Database Setup**
   Run the SQL migration found in `supabase_migration.sql` in your Supabase SQL Editor to set up the `activity_logs` table and RLS policies.

5. **Start Development Server**
   ```bash
   npm start
   ```
   Navigate to `http://localhost:4200`.

---

## 🏗️ Project Structure

```text
src/
├── app/
│   ├── auth/          # Authentication flows
│   ├── core/          # Services, guards, and shared logic
│   ├── dashboard/     # Main tracking interface
│   ├── landing/       # Premium landing page
│   ├── profile/       # User settings
│   ├── subjects/      # Subject & Topic management
│   └── shared/        # UI components & pipes
├── assets/            # Static images and icons
└── styles.css         # Global design system & tokens
```

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">

Built with ❤️ for masters of their craft.

[Follow on GitHub](https://github.com/ayushgohil) • [Report Bug](https://github.com/ayushgohil/Skill-Tracker/issues)

</div>
