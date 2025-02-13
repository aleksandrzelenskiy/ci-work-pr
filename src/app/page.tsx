import React from 'react';
import ReportModel from '@/app/models/ReportModel';
import ReportListPage from './components/ReportListPage';
import TaskListPage from './components/TaskListPage';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Typography } from '@mui/material';
import { GetCurrentUserFromMongoDB } from '@/server-actions/users';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TaskOutlinedIcon from '@mui/icons-material/TaskOutlined';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';

const DashboardPage: React.FC = async () => {
  const response = await GetCurrentUserFromMongoDB();

  if (!response || !response.success) {
    return (
      <Box className='p-4 md:p-8' sx={{ minHeight: '100vh' }}>
        <Typography variant='h4' component='h1' align='center' color='error'>
          {response?.message || 'User data not found'}
        </Typography>
      </Box>
    );
  }

  const user = response.data;
  const { name, email, clerkUserId, role } = user;

  // Условие $match в зависимости от роли
  let matchCondition: Record<string, string> = {};
  if (role === 'executor') {
    matchCondition = { executorId: clerkUserId };
  } else if (role === 'initiator') {
    matchCondition = { initiatorId: clerkUserId };
  } else {
    // Например, admin => оставляем пустым, чтобы показывать все
    matchCondition = {};
  }

  // =====================
  // Текущая статистика (за всё время)
  // =====================
  const reportsAggregation = await ReportModel.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const reportCounts: { [key: string]: number } = {
    Pending: 0,
    Issues: 0,
    Fixed: 0,
    Agreed: 0,
  };
  reportsAggregation.forEach((item) => {
    if (item._id in reportCounts) {
      reportCounts[item._id] = item.count;
    }
  });

  // =====================
  // Статистика за ПРЕДЫДУЩИЙ месяц
  // =====================
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const reportsAggregationLastMonth = await ReportModel.aggregate([
    {
      $match: {
        ...matchCondition,
        createdAt: {
          $gte: startOfLastMonth,
          $lt: startOfThisMonth,
        },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const reportCountsLastMonth: { [key: string]: number } = {
    Pending: 0,
    Issues: 0,
    Fixed: 0,
    Agreed: 0,
  };
  reportsAggregationLastMonth.forEach((item) => {
    if (item._id in reportCountsLastMonth) {
      reportCountsLastMonth[item._id] = item.count;
    }
  });

  // =====================
  // Функция вычисления разницы в %
  // =====================
  function getDifferencePercent(current: number, previous: number) {
    // (current - previous)/previous * 100
    if (previous === 0) {
      // Если раньше было 0, а сейчас > 0 — «бесконечный» рост
      if (current > 0) return 999; // можно заменить на любое число или '∞'
      // если обе величины 0 => 0
      return 0;
    }
    const diff = ((current - previous) / previous) * 100;
    return diff;
  }

  // Посчитаем для каждого статуса
  const diffPending = getDifferencePercent(
    reportCounts.Pending,
    reportCountsLastMonth.Pending
  );
  const diffIssues = getDifferencePercent(
    reportCounts.Issues,
    reportCountsLastMonth.Issues
  );
  const diffFixed = getDifferencePercent(
    reportCounts.Fixed,
    reportCountsLastMonth.Fixed
  );
  const diffAgreed = getDifferencePercent(
    reportCounts.Agreed,
    reportCountsLastMonth.Agreed
  );

  // =====================
  // Хэлпер для генерации нужного цвета/иконки
  // =====================
  function getColorAndIcon(diffValue: number) {
    if (diffValue > 0) {
      return {
        color: 'green', // зелёный текст
        Icon: <TrendingUpIcon sx={{ color: 'green' }} />,
      };
    } else if (diffValue < 0) {
      return {
        color: 'red', // красный текст
        Icon: <TrendingDownIcon sx={{ color: 'red' }} />,
      };
    }
    // diffValue === 0
    return {
      color: 'inherit',
      Icon: null,
    };
  }

  // Функция форматирования. Убираем десятичные (Math.round)
  function formatDiff(diffValue: number): string {
    const rounded = Math.round(Math.abs(diffValue));
    // + / - / (нет знака)
    const sign = diffValue > 0 ? '+' : diffValue < 0 ? '-' : '';
    return `${sign}${rounded}% from last month`;
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Приветствие */}
      <Box className='mb-6'>
        <Typography variant='h5' component='h1' align='center'>
          Welcome, {name} ({role})!
        </Typography>
        <Typography variant='body2' component='p' align='center'>
          {email}
        </Typography>
      </Box>
      <Box className='mb-4' sx={{ width: '100%' }}>
        <Accordion defaultExpanded>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls='panel1-content'
            id='panel1-header'
          >
            <Typography variant='h5' align='center'>
              Dashboards
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Блок счётчиков */}
            <Typography> Reports stasistic </Typography>
            <Box className='mb-8' sx={{ width: '100%' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  justifyContent: 'center',
                  width: '100%',
                }}
              >
                {/* Pending */}
                <Box
                  className='flex flex-col items-center p-4'
                  sx={{
                    width: { xs: '100%', sm: '45%', md: '22%' },
                    boxSizing: 'border-box',
                  }}
                >
                  {(() => {
                    const { color, Icon } = getColorAndIcon(diffPending);
                    return (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Typography variant='h6'>Pending</Typography>
                        </Box>
                        <Typography variant='h3'>
                          {reportCounts.Pending}
                        </Typography>
                        <Typography variant='body2' sx={{ color }}>
                          {Icon} {formatDiff(diffPending)}
                        </Typography>
                      </>
                    );
                  })()}
                </Box>

                {/* Issues */}
                <Box
                  className='flex flex-col items-center p-4'
                  sx={{
                    width: { xs: '100%', sm: '45%', md: '22%' },
                    boxSizing: 'border-box',
                  }}
                >
                  {(() => {
                    const { color, Icon } = getColorAndIcon(diffIssues);
                    return (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Typography variant='h6'>Issues</Typography>
                        </Box>
                        <Typography variant='h3'>
                          {reportCounts.Issues}
                        </Typography>
                        <Typography variant='body2' sx={{ color }}>
                          {Icon} {formatDiff(diffIssues)}
                        </Typography>
                      </>
                    );
                  })()}
                </Box>

                {/* Fixed */}
                <Box
                  className='flex flex-col items-center p-4'
                  sx={{
                    width: { xs: '100%', sm: '45%', md: '22%' },
                    boxSizing: 'border-box',
                  }}
                >
                  {(() => {
                    const { color, Icon } = getColorAndIcon(diffFixed);
                    return (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Typography variant='h6'>Fixed</Typography>
                        </Box>
                        <Typography variant='h3'>
                          {reportCounts.Fixed}
                        </Typography>
                        <Typography variant='body2' sx={{ color }}>
                          {Icon} {formatDiff(diffFixed)}
                        </Typography>
                      </>
                    );
                  })()}
                </Box>

                {/* Agreed */}
                <Box
                  className='flex flex-col items-center p-4'
                  sx={{
                    width: { xs: '100%', sm: '45%', md: '22%' },
                    boxSizing: 'border-box',
                  }}
                >
                  {(() => {
                    const { color, Icon } = getColorAndIcon(diffAgreed);
                    return (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Typography variant='h6'>Agreed</Typography>
                        </Box>
                        <Typography variant='h3'>
                          {reportCounts.Agreed}
                        </Typography>
                        <Typography variant='body2' sx={{ color }}>
                          {Icon} {formatDiff(diffAgreed)}
                        </Typography>
                      </>
                    );
                  })()}
                </Box>
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Блок Your Tasks */}

      <Box className='mb-4' sx={{ width: '100%' }}>
        <Accordion>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls='panel2-content'
            id='panel2-header'
          >
            <Typography variant='h5' align='center'>
              Last Tasks
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ width: '100%' }}>
              <TaskListPage />
            </Box>
            <Box sx={{ marginTop: '30px', textAlign: 'center' }}>
              <Button
                variant='contained'
                startIcon={<TaskOutlinedIcon />}
                size='small'
                href='/tasks'
              >
                Open Tasks
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
      <Box className='mb-4' sx={{ width: '100%' }}>
        <Accordion>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls='panel2-content'
            id='panel2-header'
          >
            <Typography variant='h5' align='center'>
              Last Reports
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ width: '100%' }}>
              <ReportListPage />
            </Box>
            <Box sx={{ marginTop: '30px', textAlign: 'center' }}>
              <Button
                variant='contained'
                startIcon={<PermMediaOutlinedIcon />}
                size='small'
                href='/reports'
              >
                Reports List
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
};

export default DashboardPage;
