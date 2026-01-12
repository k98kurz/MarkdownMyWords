# [TICKET-010] UI Theme System

## Metadata
- **Status**: ready
- **Complexity**: simple
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 3h
- **Depends on**: TICKET-002

## Request

Implement dark and light theme system with theme switching and persistence.

### User Story

As a user, I want to switch between light and dark themes so that I can use the application comfortably in different lighting conditions.

### Requirements

1. **Theme System**
   - Light theme CSS variables
   - Dark theme CSS variables
   - Theme switching functionality
   - System preference detection

2. **Theme State Management**
   - Zustand UI store for theme
   - Theme state management
   - Persist theme preference

3. **UI Components**
   - Theme toggle button
   - Theme applied to all components
   - Smooth transitions

4. **Persistence**
   - Store theme in GunDB
   - Load theme on app start
   - Sync theme across devices

## Acceptance Criteria

- [ ] Light theme implemented
- [ ] Dark theme implemented
- [ ] Theme switching working
- [ ] System preference detection working
- [ ] Theme persisted in GunDB
- [ ] Theme loaded on app start
- [ ] All components themed
- [ ] Smooth transitions
- [ ] Theme toggle in header

## Technical Notes

### CSS Variables

```css
:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  /* ... */
}

:root[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #e0e0e0;
  /* ... */
}
```

### Theme Store (Zustand)

```typescript
const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  setTheme: (theme: 'light' | 'dark') => {
    set({ theme });
    document.documentElement.setAttribute('data-theme', theme);
  },
  toggleTheme: () => {
    const current = useUIStore.getState().theme;
    useUIStore.getState().setTheme(current === 'light' ? 'dark' : 'light');
  }
}));
```

## Related

- TICKET-002: Project setup
- TICKET-003: GunDB integration (for persistence)
