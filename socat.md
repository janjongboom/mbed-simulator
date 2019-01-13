mkdir tty
touch tty/master
touch tty/slave
sudo socat -d -d -d -d -lf /tmp/socat pty,link=$PWD/tty/master,raw,echo=0,user=$(whoami),group=staff pty,link=$PWD/tty/slave,raw,echo=0,user=$(whoami),group=staff

