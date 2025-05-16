
# TradingPro - Advanced Financial Charts

TradingPro is a professional trading platform with advanced financial charts that works across Web, iOS, and Android.

![TradingPro Screenshot](https://lovable.dev/opengraph-image-p98pqg.png)

## Features

- Real-time financial charts with multiple timeframes
- Support for different chart types (Candlestick, Line, Bar, Area)
- Volume indicators
- Mobile-responsive design for all devices
- Cross-platform support (Web, iOS, Android)

## Project Info

**URL**: https://lovable.dev/projects/46dce0b3-ffa1-418e-b9fc-e0b2ac3ecbad

## Running the Application

### Web Version

To run the web version of TradingPro:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### iOS Version

To run TradingPro on iOS:

1. Make sure you have a Mac with Xcode installed (12.5 or higher)
2. Have iOS development tools set up

```bash
# Install dependencies
npm install

# Build the web app
npm run build

# Add iOS platform
npx cap add ios

# Update native iOS platform
npx cap update ios

# Sync web code to native platform
npx cap sync ios

# Open in Xcode
npx cap open ios
```

From Xcode, you can run the app on a simulator or physical device.

### Android Version

To run TradingPro on Android:

1. Make sure you have Android Studio installed
2. Have Android development tools and SDK set up

```bash
# Install dependencies
npm install

# Build the web app
npm run build

# Add Android platform
npx cap add android

# Update native Android platform
npx cap update android

# Sync web code to native platform
npx cap sync android

# Open in Android Studio
npx cap open android
```

From Android Studio, you can run the app on an emulator or physical device.

### Live Development with Mobile

For live development with instant updates on mobile devices:

```bash
# Start dev server
npm run dev

# Sync changes to native platforms
npx cap sync
```

Use the server URL in the capacitor.config.ts file to enable live reloading.

## API Configuration

The app connects to a trading API server running at `http://localhost:3000/api/v1`. Make sure the API server is running when using the application.

## Technology Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Lightweight Charts
- Capacitor for mobile deployment
- Shadcn/ui for component library

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License
