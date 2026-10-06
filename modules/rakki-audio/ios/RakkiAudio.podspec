Pod::Spec.new do |s|
  s.name           = 'RakkiAudio'
  s.version        = '0.1.0'
  s.summary        = 'Rakki audio engine: gapless AVQueuePlayer, lock screen and remote commands'
  s.description    = s.summary
  s.license        = 'AGPL-3.0-only'
  s.author         = 'LuckiRakki'
  s.homepage       = 'https://github.com/LuckiRakki/rakki'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/LuckiRakki/rakki.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MetricKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
