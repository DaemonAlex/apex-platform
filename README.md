# APEX Platform - AV Project Management System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](#)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](#)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](#)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)](#)

A comprehensive Audio-Visual Project Management Platform designed for professional AV integrators, project managers, and field operations teams.

## 🚀 Features

### Project Management
- **Complete Project Lifecycle**: From planning to completion
- **Task Management**: Hierarchical tasks with dependencies and time tracking
- **Budget Tracking**: Real-time budget vs. actual cost analysis
- **Team Collaboration**: Multi-user assignments and progress tracking
- **Document Management**: File attachments and project documentation

### Field Operations
- **Scheduling System**: Advanced field work scheduling with calendar integration
- **Mobile-Friendly**: Responsive design for field technicians
- **Reschedule Management**: Comprehensive reschedule tracking with reason analysis
- **Work Order Management**: Installation, commissioning, break/fix, and maintenance
- **Resource Planning**: Technician and vendor coordination

### Executive Reporting
- **Real-Time Dashboards**: Executive insights and KPI tracking
- **Analytics**: Project performance, resource utilization, and financial metrics
- **Productivity Monitoring**: Team performance and efficiency tracking
- **Custom Reports**: Excel, PDF, and CSV export capabilities
- **Advanced Filtering**: Multi-dimensional data filtering and search

### Productivity Features
- **Activity Tracking**: Real-time productivity monitoring
- **Personal Insights**: Individual performance analytics
- **Early Warning Systems**: Project risk detection and alerts
- **Audit Logging**: Complete activity trail for compliance

## 📋 Quick Start

### Deployment Options

#### 1. Static Web Hosting (Recommended)
```bash
# Clone repository
git clone https://github.com/yourusername/apex-platform.git
cd apex-platform

# Deploy to web server (Apache/Nginx)
cp index.html /var/www/html/
# Configure HTTPS (see deployment documentation)
```

#### 2. Local Development
```bash
# Serve locally with Python
python -m http.server 8000

# Or with Node.js
npx serve .

# Open browser to http://localhost:8000
```

#### 3. Nginx Production Setup
```nginx
server {
    listen 443 ssl http2;
    server_name apex.yourdomain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    root /var/www/apex;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 🔧 Configuration

The platform works offline by default using browser localStorage. For enhanced features, configure the optional backend:

```javascript
// In index.html, update configuration
const AppState = {
    config: {
        USE_BACKEND: false,  // Set to true for backend features
        apiUrl: '/api',      // Backend API endpoint
        masterAccounts: ['admin@company.com']
    }
};
```

## 📖 Documentation

- [**Application Overview**](APEX_APPLICATION_OVERVIEW.md) - Complete platform overview
- [**Security Documentation**](APEX_SECURITY_DOCUMENTATION.md) - Security architecture and best practices
- [**API Documentation**](APEX_API_DOCUMENTATION.md) - Backend API reference
- [**Data Storage Architecture**](APEX_DATA_STORAGE_ARCHITECTURE.md) - Data models and storage
- [**Reporting Structure**](APEX_REPORTING_STRUCTURE.md) - Analytics and reporting guide

## 🏗️ Architecture

- **Frontend**: Single-page HTML application with embedded JavaScript/CSS
- **Storage**: Browser localStorage (primary) + optional backend database
- **Dependencies**: CDN-hosted libraries (XLSX.js, jsPDF, Chart.js, SortableJS)
- **Backend**: Optional Node.js/Express API for advanced features
- **Security**: HTTPS, XSS protection, input validation, audit logging

## 🔒 Security Features

- **XSS Protection**: All user input properly escaped
- **HTTPS Only**: Secure communication enforced  
- **Role-Based Access**: Granular permission system
- **Audit Logging**: Complete activity tracking
- **Data Validation**: Client and server-side validation
- **Session Management**: Secure authentication and session handling

## 📊 System Requirements

### Client Requirements
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- JavaScript enabled
- 10MB available localStorage space
- Internet connection (for CDN libraries and optional backend)

### Server Requirements (Optional Backend)
- Node.js 16+ and npm
- Database: MariaDB/MySQL 10.6+
- Memory: 2GB RAM minimum
- Storage: 50GB+ for production use
- SSL certificate for HTTPS

## 🚀 Deployment

### Production Checklist
- [ ] Configure HTTPS with valid SSL certificate
- [ ] Set up regular backups of localStorage data
- [ ] Configure security headers in web server
- [ ] Set up monitoring and logging
- [ ] Test offline functionality
- [ ] Configure rate limiting (if using backend)
- [ ] Set up automated security updates

### Environment Setup
```bash
# Production environment variables
export NODE_ENV=production
export DB_HOST=localhost
export DB_NAME=apex
export JWT_SECRET=your-secure-secret
export SSL_CERT=/path/to/cert.pem
export SSL_KEY=/path/to/private.key
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Full documentation suite](docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/apex-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/apex-platform/discussions)
- **Security**: Report security issues to security@yourdomain.com

## 🗺️ Roadmap

- [ ] Mobile native apps (iOS/Android)
- [ ] Advanced AI/ML analytics
- [ ] Real-time collaboration features
- [ ] API integrations marketplace
- [ ] Multi-tenant SaaS version
- [ ] Advanced workflow automation

## 📈 Statistics

- **Single File Application**: Complete platform in one HTML file
- **Offline Capable**: Full functionality without internet
- **Mobile Responsive**: Works on all device sizes
- **CDN Dependencies**: Fast loading from global CDNs
- **Browser Compatibility**: Works on all modern browsers

---

**Built with ❤️ for the AV Industry**

*APEX Platform - Streamlining AV project management from concept to completion.*