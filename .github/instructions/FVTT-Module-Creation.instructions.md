# GitHub Copilot Instructions for Foundry VTT Module Creation

## Project Context
These instructions apply to foundry vtt v13+ module developement.

## Development Standards

This module follows Foundry VTT best practices documented in cheat sheets.

**MANDATORY WORKFLOW - FOLLOW STRICTLY BEFORE ANY CODE CHANGES:**

### Before Writing ANY Code:

1. **Check Local Cheat Sheets First**
   - Review relevant cheat sheet files in `cheatSheets/` folder
   - Look for existing patterns that match the requested task
   - If found, apply the documented pattern immediately

2. **FETCH THE OFFICIAL DOCUMENTATION** - Use fetch_webpage or github_repo tool
   - Read and understand the official Foundry VTT approaches for the feature

### Official Documentation Sources (Fetch These):

- **Application V2 Wiki:** https://foundryvtt.wiki/en/development/api/applicationv2
- **Application V2 Migration:** https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide
- **Foundry Wiki:** https://foundryvtt.wiki/en/development/api/
  - If the above sources aren't broad enough, check here for additional API details
- **Foundry API Documentation:** https://foundryvtt.com/api/
  - If the above sources aren't broad enough, check here for additional raw API documentaion

**CRITICAL:** Never implement without fetching docs first. Never guess at patterns. Never proceed with custom solutions before verifying no official pattern exists.

## Core Development Principles

### 1. Always Check Foundry VTT API First
- Before implementing any feature, ALWAYS check Foundry VTT API documentation and wiki for existing patterns
- Use official patterns wherever possible to ensure compatibility and maintainability

### 2. Application V2 Architecture Requirements
- **NEVER use deprecated V1 APIs**: No `getData()`, `defaultOptions`, `activateListeners()` for new features
- **Always use V2 patterns**

### 4. Code Organization and Style
- **Minimize console.log statements** - only use for critical debugging, remove before finalizing
- **Modular approach**: Separate concerns into utils.js, ledger.js, settings.js, etc.
- **ES6 imports/exports**: Use modern module syntax throughout
- **Localization**: All user-facing strings use `game.i18n.localize()` with keys from languages/en.json
- **CSS scoping**: All styles scoped to `.window-controls` class to prevent conflicts

### 5. When Encountering Errors
1. **Read the actual error message** - don't guess at solutions
2. **Check for deprecated APIs** - Foundry v13 removed many V1 methods
3. **Verify property names** - D&D 5e uses `tab` not `id`, `actor` not `actorData`, etc.
4. **Look at compiled templates** - templates may load but not render if container is missing
5. **Cross-reference with Foundry VTT wiki and API documentation** - their implementation is another authoritative reference 

### 6. Testing and Validation Strategy
- Test in actual Foundry VTT, not just syntax checking
- When user reports "not working", ask for:
  - Console logs (errors AND info messages)
  - What specific action was taken
  - What was expected vs. what happened
- After major changes, update DEVELOPMENT.md and CHANGELOG.md with lessons learned

### 7. File Modification Best Practices
- **Always read files before editing** to see current state
- **Use multi_replace_string_in_file** for multiple independent changes to save time
- **Include 3-5 lines of context** before and after replacements for accuracy
- **Never create unnecessary files** - only create files explicitly requested
- **Don't create summary documents** unless specifically asked

### 8. Documentation Standards
- Keep DEVELOPMENT.md updated with technical discoveries and patterns
- Keep CHANGELOG.md updated with version history following Keep a Changelog format
- Document "gotchas" and system-specific behaviors for future reference
- Include code examples in documentation when patterns are non-obvious

## System-Specific Gotchas

### Application V2 Parts Rendering
- Parts won't render without `container` property, even if template compiles
- The `tabs` part itself doesn't need a container (it's navigation)
- Content parts (members, inventory, etc.) all need: `container: { classes: ["tab-body"], id: "tabs" }`

### CSS Specificity
- D&D 5e sheets have complex styling - always scope module CSS
- Use `.window-controls` prefix for all module styles
- Test that module CSS doesn't bleed into other Foundry UI elements

# Resources
- [Foundry VTT API Documentation](https://foundryvtt.com/api/)
- [Foundry VTT Wiki](https://foundryvtt.wiki/en/development)
- [D&D 5e System Wiki](https://github.com/foundryvtt/dnd5e/wiki)
- [D&D 5e System Source Code](https://github.com/foundryvtt/dnd5e)
- [Application V2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)

## Quick Troubleshooting Checklist
- [ ] Are you using Application V2 APIs (not V1)?
- [ ] Is CSS properly scoped to avoid conflicts?
- [ ] Are console logs cleaned up for production?
- [ ] Is documentation updated with new learnings?
